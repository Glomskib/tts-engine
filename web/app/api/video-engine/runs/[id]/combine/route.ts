/**
 * POST /api/video-engine/runs/[id]/combine
 *
 * Concatenate multiple already-rendered ve_rendered_clips into a single MP4 in
 * the order the user picked them. Reuses the existing ff_render_jobs queue and
 * stores the result as a new ve_rendered_clips row tagged
 * `template_key='combined'` so it surfaces in the same UI without a schema
 * change.
 *
 * Body: { clip_ids: string[] }   // 2..8, in playback order
 *
 * No new render is executed on the source video — we only stitch the output
 * URLs that already exist. This keeps the action cheap and avoids re-spending
 * upload credits.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

const MIN_CLIPS = 2;
const MAX_CLIPS = 8;

interface Body { clip_ids?: string[]; }

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id: runId } = await context.params;
  if (!runId) return createApiErrorResponse('BAD_REQUEST', 'run id required', 400, correlationId);

  let body: Body = {};
  try { body = (await request.json()) as Body; } catch { /* allow empty */ }

  const clipIds = Array.isArray(body.clip_ids) ? body.clip_ids.filter((s): s is string => typeof s === 'string') : [];
  if (clipIds.length < MIN_CLIPS || clipIds.length > MAX_CLIPS) {
    return createApiErrorResponse('BAD_REQUEST', `Pick ${MIN_CLIPS}–${MAX_CLIPS} clips to combine.`, 400, correlationId);
  }
  if (new Set(clipIds).size !== clipIds.length) {
    return createApiErrorResponse('BAD_REQUEST', 'Duplicate clip ids', 400, correlationId);
  }

  // Verify run ownership.
  const { data: runRow } = await supabaseAdmin
    .from('ve_runs')
    .select('id,user_id,watermark,plan_id_at_run,status,mode')
    .eq('id', runId)
    .single();
  if (!runRow) return createApiErrorResponse('NOT_FOUND', 'run not found', 404, correlationId);
  if (runRow.user_id !== auth.user.id) {
    return createApiErrorResponse('FORBIDDEN', 'not your run', 403, correlationId);
  }

  // Load every selected clip; preserve user-supplied order.
  const { data: clips } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id,run_id,user_id,candidate_id,template_key,cta_key,mode,status,output_url,duration_sec')
    .in('id', clipIds);
  if (!clips || clips.length !== clipIds.length) {
    return createApiErrorResponse('NOT_FOUND', 'one or more clips not found', 404, correlationId);
  }
  const byId = new Map(clips.map((c) => [c.id, c]));
  const ordered = clipIds.map((id) => byId.get(id)!);

  for (const c of ordered) {
    if (c.user_id !== auth.user.id) {
      return createApiErrorResponse('FORBIDDEN', 'not your clip', 403, correlationId);
    }
    if (c.run_id !== runId) {
      return createApiErrorResponse('BAD_REQUEST', 'all clips must belong to the same run', 400, correlationId);
    }
    if (c.status !== 'complete' || !c.output_url) {
      return createApiErrorResponse('BAD_REQUEST', `Clip ${c.id} is not finished rendering yet.`, 400, correlationId);
    }
  }

  // Build a Shotstack-shape timeline that places each rendered MP4 end-to-end.
  // Each clip already has captions/CTAs burned in — we just sequence them.
  let cursor = 0;
  const sequenced: Array<Record<string, unknown>> = [];
  for (const c of ordered) {
    const length = Math.max(0.5, Number(c.duration_sec ?? 0));
    sequenced.push({
      asset: { type: 'video', src: c.output_url, volume: 1 },
      start: Number(cursor.toFixed(3)),
      length: Number(length.toFixed(3)),
      fit: 'cover',
    });
    cursor += length;
  }
  const timeline = {
    background: '#000000',
    tracks: [{ clips: sequenced }],
    metadata: {
      combined: true,
      source_clip_ids: clipIds,
      total_duration_sec: Number(cursor.toFixed(3)),
    },
  };

  const newClipId = crypto.randomUUID();
  const newJobId = crypto.randomUUID();
  const firstCandidate = ordered[0].candidate_id;

  const { error: rcErr } = await supabaseAdmin.from('ve_rendered_clips').insert({
    id: newClipId,
    run_id: runId,
    candidate_id: firstCandidate,           // schema requires non-null; pin to lead clip
    user_id: auth.user.id,
    template_key: 'combined',               // sentinel the UI splits on
    cta_key: ordered[ordered.length - 1].cta_key,
    mode: runRow.mode,
    ff_render_job_id: newJobId,
    status: 'queued',
    timeline_json: timeline,
    watermark: !!runRow.watermark,
    package_status: 'skipped',              // combined videos reuse the source captions
  });
  if (rcErr) return createApiErrorResponse('DB_ERROR', `Failed to insert combined clip: ${rcErr.message}`, 500, correlationId);

  const { error: ffErr } = await supabaseAdmin.from('ff_render_jobs').insert({
    id: newJobId,
    user_id: auth.user.id,
    correlation_id: `ve:${runId}:combined:${newClipId}`,
    kind: 'shotstack_timeline',
    priority: 5,
    timeline,
    output_spec: { format: 'mp4', resolution: 'sd', aspectRatio: '9:16', fps: 30 },
    status: 'pending',
  });
  if (ffErr) {
    await supabaseAdmin.from('ve_rendered_clips').delete().eq('id', newClipId);
    return createApiErrorResponse('DB_ERROR', `Failed to enqueue render: ${ffErr.message}`, 500, correlationId);
  }

  // If the run was 'complete', flip back to 'rendering' so the tick loop
  // watches the new combined job to completion and re-fires notifications.
  if (runRow.status === 'complete') {
    await supabaseAdmin
      .from('ve_runs')
      .update({ status: 'rendering', notify_state: 'unsent', completed_at: null })
      .eq('id', runId);
  }

  return NextResponse.json({
    ok: true,
    data: {
      combined_clip_id: newClipId,
      source_clip_ids: clipIds,
      total_duration_sec: Number(cursor.toFixed(3)),
    },
    correlation_id: correlationId,
  });
}
