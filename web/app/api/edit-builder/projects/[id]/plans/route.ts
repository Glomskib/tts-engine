/**
 * POST /api/edit-builder/projects/[id]/plans — generate a new EditPlan version.
 *
 * Phase 1 was a dumb stitcher: stitch every source clip end-to-end.
 * Phase 2 (this version): AutoEdit AI brain. When ALL source clips have
 * analysis_status='done', we call Claude with the per-clip analysis (hook
 * candidates, retention moments, silence ranges, topics) and get back a
 * smart EditPlan that picks the best moments, sets a hook overlay, and
 * adds a CTA overlay tuned to the project's target_platform. If analysis
 * isn't ready or the AI call fails, we fall back to the stitcher so the
 * route never blocks.
 *
 * The response includes `plan_source: 'auto_edit_ai' | 'stitcher'` so the
 * UI can tell the user "we generated this from your analysis" vs "rough cut".
 *
 * PATCH /api/edit-builder/projects/[id]/plans — save a user-edited plan as
 * a new version (validated via Zod).
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { EditPlanSchema, buildEditPlanFromClips, type EditPlan } from '@/lib/edit-builder/types';
import {
  buildAIEditPlan,
  clipsHaveCompleteAnalysis,
  type ClipWithAnalysis,
} from '@/lib/edit-builder/auto-plan';

export const runtime = 'nodejs';

async function nextVersion(projectId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('edit_plans')
    .select('version')
    .eq('edit_project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version ?? 0) + 1;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await context.params;

  // Ownership check — pull target_platform + aspect_ratio so AutoEdit can use them.
  const { data: project, error: pErr } = await supabaseAdmin
    .from('edit_projects')
    .select('id,user_id,target_platform,aspect_ratio')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (pErr || !project) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Pull clips with analysis_status so we know whether AutoEdit can run.
  const { data: clipsRaw } = await supabaseAdmin
    .from('edit_source_clips')
    .select('id,duration_ms,sort_order,analysis_status')
    .eq('edit_project_id', id)
    .eq('user_id', auth.user.id)
    .order('sort_order', { ascending: true });

  if (!clipsRaw || clipsRaw.length === 0) {
    return NextResponse.json({ error: 'NO_CLIPS', message: 'Upload at least one clip before generating a plan.' }, { status: 400 });
  }

  // Try AutoEdit (AI plan) when ALL clips have completed analysis AND we
  // have an Anthropic key. Otherwise fall back to the dumb stitcher so the
  // route never blocks. The stitcher path keeps the route working for users
  // on the slower analysis pipeline and for any clip that fails analysis
  // transiently.
  let plan: EditPlan;
  let planSource: 'auto_edit_ai' | 'stitcher' = 'stitcher';
  let aiError: string | null = null;
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (clipsHaveCompleteAnalysis(clipsRaw) && anthropicKey) {
    try {
      // Pull the per-clip analysis JSON. Lightweight — only the fields
      // AutoEdit actually consumes.
      const { data: analyses } = await supabaseAdmin
        .from('edit_analysis')
        .select('clip_id,transcript_json,hook_candidates_json,silence_ranges_json,retention_moments_json,extracted_topics_json')
        .eq('edit_project_id', id)
        .eq('user_id', auth.user.id);

      const analysisByClip = new Map(
        (analyses ?? []).map((a) => [a.clip_id as string, a]),
      );

      const enrichedClips: ClipWithAnalysis[] = clipsRaw.map((c) => {
        const a = analysisByClip.get(c.id);
        return {
          id: c.id,
          duration_ms: c.duration_ms,
          sort_order: c.sort_order,
          transcript_json: a?.transcript_json,
          hook_candidates_json: a?.hook_candidates_json as ClipWithAnalysis['hook_candidates_json'],
          silence_ranges_json: a?.silence_ranges_json as ClipWithAnalysis['silence_ranges_json'],
          retention_moments_json: a?.retention_moments_json as ClipWithAnalysis['retention_moments_json'],
          extracted_topics_json: a?.extracted_topics_json as ClipWithAnalysis['extracted_topics_json'],
        };
      });

      // 45s budget: matches /api/public/generate-script timeout pattern.
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 45_000);
      try {
        plan = await buildAIEditPlan({
          projectId: id,
          clips: enrichedClips,
          targetPlatform: project.target_platform,
          aspectRatio: project.aspect_ratio as '9:16' | '1:1' | '16:9',
          anthropicApiKey: anthropicKey,
          signal: ac.signal,
        });
        planSource = 'auto_edit_ai';
      } finally {
        clearTimeout(t);
      }
    } catch (err) {
      // AI path failed — log to stderr, fall back to stitcher. Users get a
      // working plan either way.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[edit-builder/plans] AutoEdit failed for project ${id}: ${msg}`);
      aiError = msg.slice(0, 200);
      plan = buildEditPlanFromClips(id, clipsRaw);
      planSource = 'stitcher';
    }
  } else {
    plan = buildEditPlanFromClips(id, clipsRaw);
    planSource = 'stitcher';
  }

  // Final canonical-schema validation. If the AI plan somehow makes it this far
  // and fails (rare — auto-plan.ts already validates internally), don't 500.
  // Fall back to the stitcher and continue. A working rough-cut is always better
  // than an error returned to the user.
  let parsed = EditPlanSchema.safeParse(plan);
  if (!parsed.success && planSource === 'auto_edit_ai') {
    console.error(`[edit-builder/plans] AI plan failed canonical schema after auto-plan internal validation; falling back to stitcher. issues=${parsed.error.issues.slice(0, 3).map((i) => i.message).join('; ')}`);
    aiError = `schema_post: ${parsed.error.issues[0]?.message ?? 'unknown'}`;
    plan = buildEditPlanFromClips(id, clipsRaw);
    planSource = 'stitcher';
    parsed = EditPlanSchema.safeParse(plan);
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'PLAN_VALIDATION_FAILED', details: parsed.error.issues },
      { status: 500 },
    );
  }

  const version = await nextVersion(id);

  const { data: row, error } = await supabaseAdmin
    .from('edit_plans')
    .insert({
      edit_project_id: id,
      user_id: auth.user.id,
      version,
      plan_json: parsed.data,
      created_by_system: true,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Include plan_source so the UI can show "AI-generated" vs "rough cut" badge.
  // ai_error is included only when AutoEdit failed and we fell back, so the
  // UI can show "AI couldn't run — using a rough cut, here's what failed".
  return NextResponse.json({
    plan: row,
    plan_source: planSource,
    ...(aiError ? { ai_error: aiError } : {}),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await context.params;

  let raw: unknown = {};
  try { raw = await request.json(); } catch {}
  const parsed = EditPlanSchema.safeParse((raw as { plan?: unknown })?.plan ?? raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_PLAN', details: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.projectId !== id) {
    return NextResponse.json({ error: 'PROJECT_ID_MISMATCH' }, { status: 400 });
  }

  // Ownership check
  const { data: project } = await supabaseAdmin
    .from('edit_projects')
    .select('id')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (!project) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const version = await nextVersion(id);

  const { data: row, error } = await supabaseAdmin
    .from('edit_plans')
    .insert({
      edit_project_id: id,
      user_id: auth.user.id,
      version,
      plan_json: parsed.data,
      created_by_system: false,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ plan: row });
}
