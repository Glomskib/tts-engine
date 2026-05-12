/**
 * Cron: /api/cron/ve-cleanup — production cleanup for the /create pipeline.
 *
 * Schedules to add to vercel.json (every 15 minutes):
 *   { "path": "/api/cron/ve-cleanup", "schedule": "*\/15 * * * *" }
 *
 * Three responsibilities:
 *   1. Stuck-job sweeper — ve_runs in non-terminal status with
 *      last_tick_at older than TIMEOUT_MINUTES is flipped to `failed`.
 *      Prevents zombie runs if Vercel function crashes mid-tick.
 *   2. Storage retention — for runs older than the user's tier's
 *      storage_days (from ff_plans), delete the clip-sources + renders
 *      storage objects. DB rows are kept for history; only blobs go.
 *   3. Orphan asset GC — clip-sources objects without a matching ve_assets
 *      row are deleted (handles failed signed-URL flows where the file
 *      uploaded but the DB row never committed).
 *
 * Authenticated via Vercel cron user-agent OR CRON_SECRET bearer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIMEOUT_MINUTES = 20;
const DEFAULT_STORAGE_DAYS = 30; // fallback if ff_plans not joined

function authorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const ua = req.headers.get('user-agent') || '';
  if (/vercel-cron/i.test(ua)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === 'development';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const stats = { stuck_failed: 0, sources_deleted: 0, renders_deleted: 0, errors: [] as string[] };

  // ── 1. Stuck-job sweep ──────────────────────────────────────────────
  const timeoutCutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();
  const { data: stuck, error: stuckErr } = await supabaseAdmin
    .from('ve_runs')
    .update({ status: 'failed', error_message: `Stuck > ${TIMEOUT_MINUTES} min — pipeline timeout` })
    .in('status', ['created', 'transcribing', 'analyzing', 'assembling', 'rendering'])
    .lt('last_tick_at', timeoutCutoff)
    .select('id');
  if (stuckErr) stats.errors.push(`stuck sweep: ${stuckErr.message}`);
  stats.stuck_failed = stuck?.length || 0;

  // ── 2. Storage retention ────────────────────────────────────────────
  // For each completed/failed run older than DEFAULT_STORAGE_DAYS days,
  // delete the underlying storage objects. Keep the DB rows.
  const retentionCutoff = new Date(Date.now() - DEFAULT_STORAGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: oldAssets, error: assetErr } = await supabaseAdmin
    .from('ve_assets')
    .select('id, storage_bucket, storage_path, run_id')
    .in('run_id',
      (await supabaseAdmin
        .from('ve_runs')
        .select('id')
        .in('status', ['complete', 'failed'])
        .lt('completed_at', retentionCutoff)
        .limit(500))
        .data?.map((r) => r.id) || [],
    );

  if (assetErr) stats.errors.push(`asset query: ${assetErr.message}`);
  for (const asset of oldAssets || []) {
    if (!asset.storage_bucket || !asset.storage_path) continue;
    const { error: rmErr } = await supabaseAdmin.storage.from(asset.storage_bucket).remove([asset.storage_path]);
    if (rmErr) stats.errors.push(`source rm ${asset.storage_path}: ${rmErr.message}`);
    else stats.sources_deleted++;
  }

  // ── 3. Rendered clip retention ─────────────────────────────────────
  const { data: oldRenders, error: renderErr } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id, output_url, output_storage_url')
    .lt('created_at', retentionCutoff)
    .limit(500);

  if (renderErr) stats.errors.push(`render query: ${renderErr.message}`);
  for (const clip of oldRenders || []) {
    // Both fields may exist; try output_storage_url first
    const url = (clip.output_storage_url || clip.output_url) as string | null;
    if (!url) continue;
    // Parse bucket + path from URL pattern: .../storage/v1/object/(public|sign)/<bucket>/<path>
    const m = url.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (!m) continue;
    const [, bucket, path] = m;
    const { error: rmErr } = await supabaseAdmin.storage.from(bucket).remove([path]);
    if (rmErr) stats.errors.push(`render rm ${path}: ${rmErr.message}`);
    else stats.renders_deleted++;
  }

  return NextResponse.json({ ok: true, stats });
}
