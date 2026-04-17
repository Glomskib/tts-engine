/**
 * POST /api/video-engine/clips/[id]/regenerate
 *
 * Re-renders a single ve_rendered_clip — never re-transcribes or re-scores.
 *
 * Body: { action: 'redo' | 'restyle' | 'shorter' | 'aggressive', template_key?: string }
 *   redo       — same template, fresh render (good for "the audio glitched, try again")
 *   restyle    — different template_key on the same candidate
 *   shorter    — trim end_sec by 25% on the same candidate, same template
 *   aggressive — re-snap start to the hookiest chunk inside the candidate window
 *                and cap duration at ~12s. Same template. Produces a punchier
 *                cut that opens harder.
 *
 * Each call:
 *   - validates ownership via clip → run → user.id
 *   - checks the per-plan regenerationsPerClip cap
 *   - inserts a new ve_rendered_clip row with variant_of_id = original.id
 *   - enqueues a fresh ff_render_job
 *   - bumps original.regen_count
 *
 * The original rendered clip is preserved so the user can compare variants.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getTemplateOrDefault } from '@/lib/video-engine/templates';
import { getCTAOrDefault } from '@/lib/video-engine/ctas';
import { resolveVEPlan, WATERMARK_TEXT, filterTemplatesByPlan } from '@/lib/video-engine/limits';
import { watermarkClip } from '@/lib/video-engine/templates/shared';
import type { Mode } from '@/lib/video-engine/types';

export const runtime = 'nodejs';

interface Body {
  action?: 'redo' | 'restyle' | 'shorter' | 'aggressive';
  template_key?: string;
}

const AGGRESSIVE_MAX_DURATION_SEC = 12;
const AGGRESSIVE_MIN_DURATION_SEC = 5;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id: clipId } = await context.params;
  if (!clipId) return createApiErrorResponse('BAD_REQUEST', 'clip id required', 400, correlationId);

  let body: Body = {};
  try { body = (await request.json()) as Body; } catch { /* body is optional */ }
  const action = body.action ?? 'redo';
  if (!['redo', 'restyle', 'shorter', 'aggressive'].includes(action)) {
    return createApiErrorResponse('BAD_REQUEST', `action must be one of: redo, restyle, shorter, aggressive`, 400, correlationId);
  }
  if (action === 'restyle' && !body.template_key) {
    return createApiErrorResponse('BAD_REQUEST', 'template_key required for action=restyle', 400, correlationId);
  }

  // Load original clip + parent run + candidate.
  const { data: original } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id,run_id,candidate_id,user_id,template_key,cta_key,mode,regen_count,variant_of_id')
    .eq('id', clipId)
    .maybeSingle();
  if (!original) return createApiErrorResponse('NOT_FOUND', 'clip not found', 404, correlationId);
  if (original.user_id !== auth.user.id) {
    return createApiErrorResponse('FORBIDDEN', 'not your clip', 403, correlationId);
  }

  const { data: runRow } = await supabaseAdmin
    .from('ve_runs')
    .select('id,user_id,context_json,watermark,plan_id_at_run,status')
    .eq('id', original.run_id)
    .single();
  if (!runRow) return createApiErrorResponse('NOT_FOUND', 'parent run not found', 404, correlationId);

  const { data: cand } = await supabaseAdmin
    .from('ve_clip_candidates')
    .select('id,start_sec,end_sec,text,hook_text,clip_type')
    .eq('id', original.candidate_id)
    .single();
  if (!cand) return createApiErrorResponse('NOT_FOUND', 'source candidate not found', 404, correlationId);

  const { data: assetRow } = await supabaseAdmin
    .from('ve_assets')
    .select('storage_url,duration_sec,width,height')
    .eq('run_id', original.run_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!assetRow) return createApiErrorResponse('NOT_FOUND', 'parent asset not found', 404, correlationId);

  // Plan + regen cap. Count existing variants of this original clip (incl. self).
  const plan = resolveVEPlan(runRow.plan_id_at_run);
  if (plan.regenerationsPerClip !== -1) {
    const { count: variantCount } = await supabaseAdmin
      .from('ve_rendered_clips')
      .select('id', { count: 'exact', head: true })
      .or(`id.eq.${original.id},variant_of_id.eq.${original.id}`);
    // First render counts; "regenerationsPerClip: 1" means 1 original + 1 variant max.
    if ((variantCount ?? 0) >= 1 + plan.regenerationsPerClip && !auth.isAdmin) {
      return NextResponse.json({
        ok: false,
        error: {
          code: 'PLAN_LIMIT_REGENERATIONS',
          message: `Your ${plan.name} plan allows ${plan.regenerationsPerClip} regeneration per clip. Upgrade to Creator for unlimited regenerations.`,
          plan: plan.planId,
          upgrade_url: '/upgrade',
        },
        correlation_id: correlationId,
      }, { status: 402 });
    }
  }

  // Resolve next template / candidate window per action.
  const mode = original.mode as Mode;
  let templateKey = original.template_key as string;
  let startSec = Number(cand.start_sec);
  let endSec = Number(cand.end_sec);

  if (action === 'restyle' && body.template_key) {
    const filtered = filterTemplatesByPlan([body.template_key], plan);
    if (filtered.allowed.length === 0) {
      return NextResponse.json({
        ok: false,
        error: {
          code: 'TEMPLATE_NOT_ALLOWED',
          message: `Style "${body.template_key}" requires the Creator plan or higher.`,
          plan: plan.planId,
          upgrade_url: '/upgrade',
        },
        correlation_id: correlationId,
      }, { status: 402 });
    }
    templateKey = filtered.allowed[0];
  }

  if (action === 'shorter') {
    const dur = endSec - startSec;
    const newEnd = startSec + Math.max(4, dur * 0.75);
    endSec = Number(newEnd.toFixed(3));
  }

  if (action === 'aggressive') {
    // Re-snap start to the chunk with the strongest hookStrength feature that
    // begins inside the original window (preserving at least
    // AGGRESSIVE_MIN_DURATION_SEC of clip), then cap end at start + 12s.
    const { data: chunks } = await supabaseAdmin
      .from('ve_transcript_chunks')
      .select('start_sec,end_sec,features_json')
      .eq('run_id', original.run_id)
      .gte('start_sec', startSec)
      .lt('start_sec', endSec - AGGRESSIVE_MIN_DURATION_SEC)
      .order('start_sec', { ascending: true });

    let bestStart = startSec;
    let bestHook = -1;
    for (const ch of chunks ?? []) {
      const hook = Number((ch.features_json as Record<string, unknown> | null)?.hookStrength ?? 0);
      if (hook > bestHook) {
        bestHook = hook;
        bestStart = Number(ch.start_sec);
      }
    }

    if (bestStart > startSec) {
      startSec = Number(Math.max(0, bestStart - 0.15).toFixed(3));
    }
    const cappedEnd = Math.min(endSec, startSec + AGGRESSIVE_MAX_DURATION_SEC);
    endSec = Number(Math.max(startSec + AGGRESSIVE_MIN_DURATION_SEC, cappedEnd).toFixed(3));
  }

  // Build the new timeline.
  const template = getTemplateOrDefault(templateKey, mode);
  const cta = getCTAOrDefault(template.defaultCTAKey, mode);
  const timeline = template.build({
    candidate: {
      start: startSec,
      end: endSec,
      text: cand.text,
      hookText: cand.hook_text,
      clipType: cand.clip_type,
    },
    asset: {
      storage_url: assetRow.storage_url,
      duration_sec: Number(assetRow.duration_sec ?? 0),
      width: assetRow.width,
      height: assetRow.height,
    },
    context: runRow.context_json ?? {},
    ctaKey: cta.key,
    ctaText: cta.overlayText,
  });

  if (runRow.watermark) {
    timeline.tracks.push({ clips: [watermarkClip(WATERMARK_TEXT, Math.max(0.5, endSec - startSec))] });
  }

  // Insert new variant + enqueue fresh ff_render_job.
  const newClipId = crypto.randomUUID();
  const newJobId = crypto.randomUUID();

  const { error: rcErr } = await supabaseAdmin.from('ve_rendered_clips').insert({
    id: newClipId,
    run_id: original.run_id,
    candidate_id: original.candidate_id,
    user_id: auth.user.id,
    template_key: template.key,
    cta_key: cta.key,
    mode,
    ff_render_job_id: newJobId,
    status: 'queued',
    timeline_json: timeline,
    watermark: runRow.watermark,
    package_status: 'pending',
    variant_of_id: original.variant_of_id ?? original.id,
  });
  if (rcErr) return createApiErrorResponse('DB_ERROR', `Failed to insert variant: ${rcErr.message}`, 500, correlationId);

  const { error: ffErr } = await supabaseAdmin.from('ff_render_jobs').insert({
    id: newJobId,
    user_id: auth.user.id,
    correlation_id: `ve:${original.run_id}:${newClipId}`,
    kind: 'shotstack_timeline',
    priority: plan.renderPriority,
    timeline,
    output_spec: { format: 'mp4', resolution: 'sd', aspectRatio: '9:16', fps: 30 },
    status: 'pending',
  });
  if (ffErr) {
    await supabaseAdmin.from('ve_rendered_clips').delete().eq('id', newClipId);
    return createApiErrorResponse('DB_ERROR', `Failed to enqueue render: ${ffErr.message}`, 500, correlationId);
  }

  await supabaseAdmin
    .from('ve_rendered_clips')
    .update({ regen_count: (original.regen_count ?? 0) + 1 })
    .eq('id', original.id);

  // If the parent run was already 'complete', flip it back to 'rendering' so the
  // tick loop picks it up and watches the new job to completion.
  if (runRow.status === 'complete') {
    await supabaseAdmin
      .from('ve_runs')
      .update({ status: 'rendering', notify_state: 'unsent', completed_at: null })
      .eq('id', original.run_id);
  }

  return NextResponse.json({
    ok: true,
    data: {
      variant_clip_id: newClipId,
      variant_of_id: original.variant_of_id ?? original.id,
      template_key: template.key,
      action,
      start_sec: startSec,
      end_sec: endSec,
    },
    correlation_id: correlationId,
  });
}
