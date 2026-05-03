/**
 * POST /api/editor/jobs/[id]/script-attempts/[attemptId]/override
 *
 * Marks the chosen attempt as user_override_chosen=true and unmarks all
 * other attempts in the same script_group. Then sets the parent job to
 * status='re_render_pending' so a worker re-renders the final video using
 * the user's preferred takes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; attemptId: string }> },
) {
  const { id: jobId, attemptId } = await ctx.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Lookup the chosen attempt + verify ownership
  const { data: attempt } = await supabaseAdmin
    .from('script_attempts')
    .select('id, edit_job_id, user_id, script_group')
    .eq('id', attemptId)
    .eq('edit_job_id', jobId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  // Clear all overrides in this group, then set the chosen one
  await supabaseAdmin
    .from('script_attempts')
    .update({ user_override_chosen: false })
    .eq('edit_job_id', jobId)
    .eq('script_group', attempt.script_group);

  await supabaseAdmin
    .from('script_attempts')
    .update({ user_override_chosen: true })
    .eq('id', attemptId);

  // Mark the parent ai_edit_jobs as re_render_pending so a worker can pick
  // it up. (The current pipeline just marks status='completed' — we add a
  // soft "needs_rerender" flag on the metadata field to avoid breaking
  // existing state machines.)
  // Read-modify-write so we don't blow away other metadata keys set elsewhere
  // in the pipeline (e.g. render_args, b-roll cues, debug breadcrumbs).
  const { data: existing } = await supabaseAdmin
    .from('ai_edit_jobs')
    .select('metadata')
    .eq('id', jobId)
    .maybeSingle();
  const prevMeta = (existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata))
    ? (existing.metadata as Record<string, unknown>)
    : {};
  await supabaseAdmin
    .from('ai_edit_jobs')
    .update({
      metadata: {
        ...prevMeta,
        needs_rerender: true,
        rerender_requested_at: new Date().toISOString(),
      },
    })
    .eq('id', jobId);

  return NextResponse.json({ ok: true });
}
