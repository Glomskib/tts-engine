/**
 * Cron: /api/cron/editor-cleanup (every 15 minutes via vercel.json)
 *
 * Two responsibilities:
 *   1. Timeout sweeper — any job stuck in a non-terminal status with
 *      started_at older than 30 minutes is flipped to `failed` with a
 *      specific error message. Prevents zombie jobs if Inngest crashes.
 *   2. Storage GC — jobs in terminal states (completed/failed) older than
 *      30 days have their raw + output storage assets deleted but the DB
 *      row is kept for history/debugging.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { BUCKET_NAME, type EditJobAsset } from '@/lib/editor/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TIMEOUT_MINUTES = 30;
const GC_DAYS = 30;
const ACTIVE_STATUSES = ['queued', 'transcribing', 'building_timeline', 'rendering'];

export async function GET(request: Request) {
  // Vercel cron authenticates via user-agent + internal routing; we also
  // accept an explicit CRON_SECRET if present (optional).
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  if (secret && url.searchParams.get('secret') !== secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    // Vercel cron sends user-agent 'vercel-cron/1.0' — allow it through.
    const ua = request.headers.get('user-agent') || '';
    if (!/vercel-cron/i.test(ua)) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
  }

  const timeoutCutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();
  const gcCutoff = new Date(Date.now() - GC_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // --- 1. Timeout sweep ---
  const { data: stuck, error: stuckErr } = await supabaseAdmin
    .from('edit_jobs')
    .select('id')
    .in('status', ACTIVE_STATUSES)
    .lt('started_at', timeoutCutoff);

  const timedOut: string[] = [];
  if (!stuckErr && stuck) {
    for (const row of stuck) {
      await supabaseAdmin
        .from('edit_jobs')
        .update({
          status: 'failed',
          error: 'Job timed out after 30 minutes. Try again with a shorter clip.',
          finished_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      timedOut.push(row.id);
    }
  }

  // --- 2. Storage GC for old terminal jobs ---
  const { data: oldJobs } = await supabaseAdmin
    .from('edit_jobs')
    .select('id,user_id,assets,output_url')
    .in('status', ['completed', 'failed'])
    .lt('updated_at', gcCutoff)
    .limit(100);

  let gcDeleted = 0;
  for (const job of oldJobs ?? []) {
    const paths: string[] = [];
    const assets: EditJobAsset[] = Array.isArray(job.assets) ? job.assets : [];
    for (const a of assets) if (a.path) paths.push(a.path);
    // Best-effort: also purge the output folder.
    paths.push(`${job.user_id}/${job.id}/output/final.mp4`);

    if (paths.length > 0) {
      await supabaseAdmin.storage.from(BUCKET_NAME).remove(paths).catch(() => {});
      gcDeleted += paths.length;
    }
    // Clear assets + output_url from the row so we don't try again.
    await supabaseAdmin
      .from('edit_jobs')
      .update({ assets: [], output_url: null, preview_url: null })
      .eq('id', job.id);
  }

  return NextResponse.json({
    ok: true,
    timedOut: timedOut.length,
    timedOutIds: timedOut,
    gcDeletedFiles: gcDeleted,
    gcJobs: oldJobs?.length ?? 0,
  });
}
