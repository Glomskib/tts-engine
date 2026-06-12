/**
 * Cron: /api/cron/ve-cleanup — production cleanup for the /create pipeline.
 *
 * Schedule (already in vercel.json):
 *   { "path": "/api/cron/ve-cleanup", "schedule": "*\/15 * * * *" }
 *
 * Three responsibilities:
 *   1. Stuck-job sweeper — ve_runs in non-terminal status with
 *      last_tick_at older than TIMEOUT_MINUTES is flipped to `failed`.
 *      Prevents zombie runs if Vercel function crashes mid-tick.
 *   2. Source auto-delete — for runs in terminal status, delete the
 *      uploaded source from R2/Supabase as soon as we no longer need it.
 *      Default: 30 min after completion for Post Maker mode, 4 hours for
 *      Clip Picker (configurable via context_json.source_retention_minutes).
 *      At 10K-user scale this avoids ~500TB/yr of unnecessary storage.
 *      GATED on render success (incident 2026-06-12): a source is only
 *      deleted once its run has >=1 ve_rendered_clips row with
 *      status='complete' AND output_url set, so a failed run can always
 *      be retried from the original upload. Hard ceiling:
 *      SOURCE_HARD_CEILING_DAYS, after which we delete regardless.
 *   3. Rendered clip retention — for runs older than the user's tier's
 *      storage_days (from ff_plans), delete the rendered clip storage
 *      objects. DB rows stay.
 *
 * Auth via Vercel cron user-agent OR CRON_SECRET bearer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { deleteR2Object } from '@/lib/storage/r2';

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIMEOUT_MINUTES = 20;
const DEFAULT_RENDER_RETENTION_DAYS = 30;
const DEFAULT_SOURCE_RETENTION_MIN = 30;
// Hard safety ceiling for the render-success gate below. A run with no
// successful render keeps its source past normal retention so it stays
// recoverable, but we never hold a source forever — after this many days
// it gets deleted regardless. Generous on purpose: storage cost of a few
// stragglers is nothing next to an unrecoverable user upload.
const SOURCE_HARD_CEILING_DAYS = 7;

function authorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const ua = req.headers.get('user-agent') || '';
  if (/vercel-cron/i.test(ua)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === 'development';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function isR2Bucket(bucket: string): boolean {
  if (!bucket) return false;
  return bucket === (process.env.R2_BUCKET || 'flashflow-output') || bucket.startsWith('r2');
}

async function deleteFromStorage(bucket: string, path: string): Promise<{ ok: boolean; error?: string }> {
  if (!bucket || !path) return { ok: false, error: 'missing bucket/path' };
  if (isR2Bucket(bucket)) {
    const ok = await deleteR2Object(path);
    return { ok, error: ok ? undefined : 'R2 delete failed' };
  }
  // Supabase
  const { error } = await supabaseAdmin.storage.from(bucket).remove([path]);
  return { ok: !error, error: error?.message };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const stats = {
    stuck_failed: 0,
    sources_deleted: 0,
    sources_deferred: 0,
    sources_force_deleted: 0,
    renders_deleted: 0,
    errors: [] as string[],
  };

  // ── 1. Stuck-job sweep ──────────────────────────────────────────────
  const timeoutCutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();
  const { data: stuck } = await supabaseAdmin
    .from('ve_runs')
    .update({ status: 'failed', error_message: `Stuck > ${TIMEOUT_MINUTES} min — pipeline timeout` })
    .in('status', ['created', 'transcribing', 'analyzing', 'assembling', 'rendering'])
    .lt('last_tick_at', timeoutCutoff)
    .select('id');
  stats.stuck_failed = stuck?.length || 0;

  // ── 2. Source auto-delete (the big storage saver) ───────────────────
  // For each run in terminal status, look up the per-run retention from
  // context_json and delete sources past that age.
  const { data: completedRuns } = await supabaseAdmin
    .from('ve_runs')
    .select('id, status, completed_at, context_json, updated_at')
    .in('status', ['complete', 'failed'])
    .lt('updated_at', new Date(Date.now() - DEFAULT_SOURCE_RETENTION_MIN * 60 * 1000).toISOString())
    .limit(200);

  const sourceCandidates: { id: string; ageMs: number }[] = [];
  for (const run of completedRuns || []) {
    const ctx = (run.context_json || {}) as { source_retention_minutes?: number };
    const retentionMin = ctx.source_retention_minutes ?? DEFAULT_SOURCE_RETENTION_MIN;
    const ageMs = Date.now() - new Date(run.completed_at || run.updated_at).getTime();
    if (ageMs >= retentionMin * 60 * 1000) {
      sourceCandidates.push({ id: run.id, ageMs });
    }
  }

  // ── Render-success gate (incident 2026-06-12) ───────────────────────
  // A user's Post Maker runs sat in `failed` (worker bug) past the 30-min
  // retention window; this cron deleted her sources, so once the worker
  // was fixed the runs were permanently unrecoverable ("source download
  // failed: Bucket not found"). Sources are the only copy of the user's
  // upload — we may NOT delete one until the run has at least one
  // successfully rendered clip (status='complete' AND output_url set).
  // Failed / in-flight runs are skipped, which effectively pauses the
  // retention clock; they're rechecked on every cleanup pass. The hard
  // ceiling above is the only override.
  const runIdsToCleanSource: string[] = [];
  if (sourceCandidates.length > 0) {
    const { data: successfulClips } = await supabaseAdmin
      .from('ve_rendered_clips')
      .select('run_id')
      .in('run_id', sourceCandidates.map((c) => c.id))
      .eq('status', 'complete')
      .not('output_url', 'is', null);
    const runsWithSuccessfulRender = new Set((successfulClips || []).map((c) => c.run_id as string));
    const ceilingMs = SOURCE_HARD_CEILING_DAYS * 24 * 60 * 60 * 1000;

    for (const cand of sourceCandidates) {
      if (runsWithSuccessfulRender.has(cand.id)) {
        runIdsToCleanSource.push(cand.id);
        continue;
      }
      if (cand.ageMs >= ceilingMs) {
        // Past the hard ceiling with still no successful render — by now
        // a retry was either done or abandoned, so reclaim the storage.
        console.warn(
          `[ve-cleanup] retention ceiling (${SOURCE_HARD_CEILING_DAYS}d) hit with no successful render — force-deleting source run=${cand.id}`
        );
        stats.sources_force_deleted++;
        runIdsToCleanSource.push(cand.id);
        continue;
      }
      console.log(`[ve-cleanup] retention deferred — no successful render yet run=${cand.id}`);
      stats.sources_deferred++;
    }
  }

  if (runIdsToCleanSource.length > 0) {
    const { data: assetsToDelete } = await supabaseAdmin
      .from('ve_assets')
      .select('id, storage_bucket, storage_path, run_id')
      .in('run_id', runIdsToCleanSource);

    for (const asset of assetsToDelete || []) {
      if (!asset.storage_bucket || !asset.storage_path) continue;
      // Skip link-only assets (no actual storage object to delete)
      if (asset.storage_path.startsWith('link/')) continue;
      const result = await deleteFromStorage(asset.storage_bucket, asset.storage_path);
      if (result.ok) {
        stats.sources_deleted++;
        // Clear the storage_path so we don't try again
        await supabaseAdmin
          .from('ve_assets')
          .update({ storage_path: '_deleted_' + asset.storage_path.slice(0, 100) })
          .eq('id', asset.id);
      } else if (result.error) {
        stats.errors.push(`source rm ${asset.storage_path}: ${result.error}`);
      }
    }
  }

  // ── 3. Rendered clip retention (per tier, default 30 days) ──────────
  const renderCutoff = new Date(Date.now() - DEFAULT_RENDER_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: oldRenders } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id, output_url, output_storage_url')
    .lt('created_at', renderCutoff)
    .limit(500);

  for (const clip of oldRenders || []) {
    const url = (clip.output_storage_url || clip.output_url) as string | null;
    if (!url) continue;
    // R2 URL pattern: <endpoint>/<bucket>/<key>?...
    const r2Match = url.match(/r2\.cloudflarestorage\.com\/([^/]+)\/(.+?)(?:\?|$)/);
    if (r2Match) {
      const [, , key] = r2Match;
      const ok = await deleteR2Object(decodeURIComponent(key));
      if (ok) stats.renders_deleted++;
      continue;
    }
    // Supabase pattern: /object/(sign|public)/<bucket>/<path>
    const supaMatch = url.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (!supaMatch) continue;
    const [, bucket, path] = supaMatch;
    const { error: rmErr } = await supabaseAdmin.storage.from(bucket).remove([decodeURIComponent(path)]);
    if (rmErr) stats.errors.push(`render rm ${path}: ${rmErr.message}`);
    else stats.renders_deleted++;
  }

  return NextResponse.json({ ok: true, stats });
}
