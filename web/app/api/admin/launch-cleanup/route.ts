/**
 * /api/admin/launch-cleanup — one-shot pre-launch DB sweep.
 *
 * Gated to admins. Does three things:
 *   1. Delete the caller's broken Jake avatars (null or svg-data
 *      visual_url) — common dead data from before the photo-persist fix.
 *   2. Mark old stuck generation_jobs (status=running, progress<100,
 *      created >30m ago) as failed so they stop polluting the UI. The
 *      new tickGenerationJobs worker will pick up fresh ones.
 *   3. Run tickGenerationJobs once to drain the rest.
 *
 * Returns a JSON summary. Idempotent — safe to hit multiple times.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAdmin } from '@/lib/isAdmin';
import { tickGenerationJobs } from '@/lib/generation-jobs/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdmin(auth.user)) return NextResponse.json({ error: 'admin only' }, { status: 403 });

  const summary: Record<string, unknown> = {
    user_id: auth.user.id,
    started_at: new Date().toISOString(),
  };

  // 1) Delete broken Jakes for the caller
  try {
    const { data: brokenJakes } = await supabaseAdmin
      .from('brand_profiles')
      .select('id, avatar_visual_reference_url')
      .eq('user_id', auth.user.id)
      .eq('is_avatar', true)
      .eq('avatar_display_name', 'Jake');

    const toDelete = (brokenJakes || []).filter(r =>
      !r.avatar_visual_reference_url ||
      String(r.avatar_visual_reference_url).startsWith('data:image/svg+xml')
    );

    if (toDelete.length > 0) {
      const { error } = await supabaseAdmin
        .from('brand_profiles')
        .delete()
        .in('id', toDelete.map(r => r.id));
      summary.broken_jakes_deleted = error ? 0 : toDelete.length;
      if (error) summary.broken_jakes_error = error.message;
    } else {
      summary.broken_jakes_deleted = 0;
    }
  } catch (e) {
    summary.broken_jakes_error = e instanceof Error ? e.message : String(e);
  }

  // 2) Mark old stuck generation_jobs as failed (30+ min, status=running,
  //    progress<100). The new worker doesn't know how to recover them —
  //    they were created before v8 shipped. Mark failed so UI is clean.
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuck } = await supabaseAdmin
      .from('generation_jobs')
      .select('id')
      .eq('status', 'running')
      .lt('progress', 100)
      .lt('created_at', cutoff);

    if (stuck && stuck.length > 0) {
      const { error } = await supabaseAdmin
        .from('generation_jobs')
        .update({
          status: 'failed',
          step: 'failed',
          progress: 100,
          output: { error: 'Pre-v8 stuck job — cleared by launch-cleanup sweep' },
          updated_at: new Date().toISOString(),
        })
        .in('id', stuck.map(j => j.id));
      summary.old_stuck_jobs_cleared = error ? 0 : stuck.length;
      if (error) summary.old_stuck_jobs_error = error.message;
    } else {
      summary.old_stuck_jobs_cleared = 0;
    }
  } catch (e) {
    summary.old_stuck_jobs_error = e instanceof Error ? e.message : String(e);
  }

  // 3) Tick the worker once to drain any fresh jobs that have piled up
  try {
    const tickResults = await tickGenerationJobs(5);
    summary.fresh_jobs_advanced = tickResults.length;
    summary.fresh_jobs_results = tickResults;
  } catch (e) {
    summary.fresh_jobs_error = e instanceof Error ? e.message : String(e);
  }

  summary.completed_at = new Date().toISOString();
  return NextResponse.json({ ok: true, summary });
}
