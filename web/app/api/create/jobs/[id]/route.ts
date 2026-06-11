/**
 * GET /api/create/jobs/[id] — job status + clip outputs for /create's progress view.
 *
 * Normalizes the ve_runs / ve_clip_candidates / ve_rendered_clips chain into a
 * simple shape the frontend can render.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROGRESS_BY_STATUS: Record<string, number> = {
  created: 5,
  transcribing: 20,
  analyzing: 45,
  assembling: 65,
  rendering: 85,
  complete: 100,
  failed: 0,
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  const { data: run, error: runErr } = await supabaseAdmin
    .from('ve_runs')
    .select('id, user_id, status, error_message, context_json, target_clip_count, created_at, completed_at')
    .eq('id', id)
    .single();

  if (runErr || !run) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  if (run.user_id !== auth.user.id && !auth.isAdmin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  // Pull rendered clips (final outputs) + candidates (for in-progress display)
  let rendered: Array<Record<string, unknown>> | null = null;
  try {
    const { data } = await supabaseAdmin
      .from('ve_rendered_clips')
      .select('id, output_url, output_storage_url, duration_sec, status, feel_diagnosis')
      .eq('run_id', id)
      .order('created_at', { ascending: true });
    rendered = data as Array<Record<string, unknown>> | null;
  } catch {
    rendered = null;
  }

  const clips = (rendered || []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    output_url: (c.output_url || c.output_storage_url) as string | null,
    hook_score: typeof c.hook_score === 'number' ? c.hook_score : typeof c.score === 'number' ? c.score : null,
    duration_sec: typeof c.duration_sec === 'number' ? c.duration_sec : null,
    feel_diagnosis: (c.feel_diagnosis as string | null) ?? null,
    status: (c.status as string) || 'rendering',
  }));

  // Edit receipt — written by the pipeline's assemble stage into context_json.
  // Surfaced so /create can show "what we edited" once the job completes.
  const editReceipt =
    (((run.context_json ?? {}) as Record<string, unknown>).edit_receipt as Record<string, unknown> | undefined) ?? null;

  return NextResponse.json({
    ok: true,
    id: run.id,
    status: run.status,
    error_message: run.error_message,
    progress_pct: PROGRESS_BY_STATUS[run.status] ?? 10,
    target_clip_count: run.target_clip_count,
    clips,
    edit_receipt: editReceipt,
    created_at: run.created_at,
    completed_at: run.completed_at,
  });
}

/**
 * POST /api/create/jobs/[id] — retry a failed or stuck run.
 *
 * Resets the run to status='created' so the worker tick will pick it back up.
 * Only the run owner (or admin) can retry. Idempotent.
 *
 * Body (optional):
 *   { from?: 'failed' | 'stuck' }  — extra guard; default lets any non-complete
 *                                    status retry.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  const { data: run, error: runErr } = await supabaseAdmin
    .from('ve_runs')
    .select('id, user_id, status')
    .eq('id', id)
    .single();
  if (runErr || !run) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  if (run.user_id !== auth.user.id && !auth.isAdmin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  if (run.status === 'complete') {
    return NextResponse.json({ ok: false, error: 'already_complete' }, { status: 409 });
  }

  // Reset the run so the worker tick claims it again.
  const { error: updErr } = await supabaseAdmin
    .from('ve_runs')
    .update({
      status: 'created',
      error_message: null,
      last_tick_at: null, // clear the claim so it can be picked up immediately
    })
    .eq('id', id);
  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, status: 'created' });
}
