/**
 * Cron: tick the Video Engine state machine.
 *
 * Picks up to N active runs (status NOT IN complete/failed) and advances each
 * by one stage. Authenticated by Vercel Cron header (or CRON_SECRET).
 *
 * Schedule (add to vercel.json):
 *   { "path": "/api/cron/video-engine-tick", "schedule": "*\/1 * * * *" }
 *
 * 2026-06-05: added diagnostic output (candidate count, claim attempts,
 * each tick's stage/error) so when the queue stalls we can see WHY in one
 * curl instead of log-diving. Also auto-fails any run older than 24h that's
 * never reached complete/failed — those are stuck zombies that block the
 * queue depth metric forever; this self-heals the queue.
 */
import { NextRequest, NextResponse } from 'next/server';
import { tickActiveRuns, tickRun } from '@/lib/video-engine/pipeline';
import { notifyPendingRuns } from '@/lib/video-engine/notify';
import { processDistributionJobs } from '@/lib/video-engine/distribution';
import { tickGenerationJobs } from '@/lib/generation-jobs/worker';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { authorizedBySecret, isVercelCron, authorizedCron } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Runs older than this with status not in (complete, failed) are treated as
// abandoned zombies and force-failed so they stop blocking the queue depth
// metric and the cron's tickActiveRuns candidate window.
//
// 2026-06-09: lowered from 24h → 6h. Launch-day audit caught a single
// 16h stuck ve_run keeping /api/health stuck on `degraded`. 6h is plenty
// of slack for any legitimate render — HeyGen worst case is ~5min, our
// own pipelines cap at 90s — so anything older than 6h is definitionally
// abandoned. Sweeps on the next cron tick (every minute).
const ZOMBIE_AGE_HOURS = 6;

/**
 * 2026-06-11 — root-cause fix for "cron 401s every minute" (the bug that made
 * the whole pipeline browser-driven via QueueTicker, so short uploads never
 * advanced past 'created' once the tab closed).
 *
 * What Vercel ACTUALLY sends with a cron invocation:
 *   - `authorization: Bearer <CRON_SECRET>` — only when the CRON_SECRET env
 *     var exists in the Production environment at deploy time
 *   - user-agent `vercel-cron/1.0`
 * It does NOT send an `x-vercel-cron` header.
 *
 * 2026-06 — the auth check that lived inline here was extracted to
 * web/lib/cron-auth.ts so the publishing crons (hhh-daily-content et al, which
 * had diverged onto a header Vercel never sends and 401'd every morning) share
 * ONE source of truth and can't silently drift again. `authorized` keeps the
 * same semantics: real secret OR Vercel-cron-shaped request.
 */
function authorized(request: NextRequest): boolean {
  return authorizedCron(request);
}

/**
 * Auto-fail runs older than ZOMBIE_AGE_HOURS that never reached a terminal
 * status. Returns the IDs that got expired so the cron response can show
 * them. Safe to call every tick — UPDATE is a no-op when nothing matches.
 */
async function expireZombieRuns(): Promise<{ count: number; ids: string[] }> {
  const cutoff = new Date(Date.now() - ZOMBIE_AGE_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('ve_runs')
    .update({
      status: 'failed',
      error_message: `auto-failed: stuck >${ZOMBIE_AGE_HOURS}h with no progress (zombie cleanup)`,
      completed_at: new Date().toISOString(),
      last_tick_at: new Date().toISOString(),
    })
    .not('status', 'in', '(complete,failed)')
    .lt('created_at', cutoff)
    .select('id');
  if (error) {
    console.error('[VE-cron] zombie cleanup failed:', error.message);
    return { count: 0, ids: [] };
  }
  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length > 0) {
    console.warn('[VE-cron] auto-failed zombie runs:', ids);
  }
  return { count: ids.length, ids };
}

/**
 * Snapshot the queue depth + oldest pending age so the cron response can
 * show whether the queue is moving or stuck without a separate query.
 */
async function snapshotQueue(): Promise<{
  depth: number;
  oldest_pending_age_sec: number | null;
  by_status: Record<string, number>;
}> {
  const by_status: Record<string, number> = {};
  let depth = 0;
  let oldest_pending_age_sec: number | null = null;
  try {
    const { data } = await supabaseAdmin
      .from('ve_runs')
      .select('status,created_at')
      .not('status', 'in', '(complete,failed)')
      .order('created_at', { ascending: true })
      .limit(200);
    const rows = data ?? [];
    depth = rows.length;
    for (const r of rows) {
      const s = (r.status as string) || 'unknown';
      by_status[s] = (by_status[s] || 0) + 1;
    }
    if (rows.length > 0 && rows[0].created_at) {
      oldest_pending_age_sec = Math.floor(
        (Date.now() - new Date(rows[0].created_at as string).getTime()) / 1000,
      );
    }
  } catch (e) {
    console.error('[VE-cron] snapshotQueue failed:', e);
  }
  return { depth, oldest_pending_age_sec, by_status };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Race guard: when a dev is running the pipeline locally, the deployed
  // Vercel cron must NOT also advance the same runs (ffmpeg version mismatch,
  // duplicate status transitions, stale errors). Skip any remote-triggered
  // tick when either flag is set. Direct manual calls from the dev machine
  // (no x-vercel-cron header) still work.
  const isRemoteCron = isVercelCron(request);
  const disableRemote = process.env.DISABLE_REMOTE_TICKS === 'true';
  const isDevEnv = process.env.NODE_ENV === 'development';
  if (isRemoteCron && (disableRemote || isDevEnv)) {
    console.log('[VE] Skipping remote tick — local dev mode', {
      disableRemote,
      isDevEnv,
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: disableRemote ? 'DISABLE_REMOTE_TICKS' : 'NODE_ENV=development',
    });
  }

  const url = new URL(request.url);

  // 2026-06-05: ?force_id=<runId> — bypass the tickActiveRuns claim race
  // and directly tick a specific run. Returns the tickRun result + any
  // thrown error so we can SEE why a stuck 'created' row isn't advancing.
  // Auth-protected like the rest of the endpoint (vercel-cron or
  // CRON_SECRET). Use sparingly — bypasses concurrency safety.
  const forceId = url.searchParams.get('force_id');
  if (forceId) {
    // force_id bypasses the claim model — privileged. The UA-based cron
    // fallback above must NOT unlock it; require the real secret.
    if (!authorizedBySecret(request)) {
      return NextResponse.json({ ok: false, error: 'force_id requires CRON_SECRET auth' }, { status: 401 });
    }
    try {
      const result = await tickRun(forceId);
      return NextResponse.json({ ok: true, forced: true, runId: forceId, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack?.split('\n').slice(0, 5).join('\n') : undefined;
      return NextResponse.json({
        ok: false,
        forced: true,
        runId: forceId,
        error: message,
        stack,
      }, { status: 500 });
    }
  }

  // Scale: cap raised from 20 → 50 to handle the /create queue at 10K-user
  // projection. Each tick processes up to N runs in parallel; the cron runs
  // every minute, so steady-state throughput is N runs/minute. At 10K users
  // doing 500 vids/mo that's ~7K runs/hour peak — 50/min handles it.
  const max = Math.min(50, Math.max(1, Number(url.searchParams.get('max') ?? 25)));
  try {
    // 0. Sweep zombies BEFORE ticking so we don't waste a claim on them.
    const zombie = await expireZombieRuns();

    // 1. Snapshot the pre-tick queue state so the response shows what we saw.
    const queueBefore = await snapshotQueue();

    // 1a. Tick generation_jobs (Quick Video / oneprompt orchestrator).
    // 2026-06-05: the oneprompt pipeline writes to generation_jobs but the
    // cron only ticked ve_runs — every Quick Video stuck at "Reading the
    // prompt" forever. Wedge fix: advance up to 3 generation jobs per cron
    // tick. Safe to run alongside tickActiveRuns (different tables).
    const genResults = await tickGenerationJobs(3).catch((e) => {
      console.error('[VE-cron] tickGenerationJobs failed:', e);
      return [];
    });

    // 2. Tick active runs.
    const results = await tickActiveRuns(max);

    // 3. Safety-net sweep: catch any terminal-state runs whose in-line notify
    //    call was lost (process restart, transient Resend failure, etc.).
    const notified = await notifyPendingRuns(10).catch((e) => {
      console.error('[cron] notifyPendingRuns failed:', e);
      return [];
    });
    const distributed = await processDistributionJobs(3).catch((e) => {
      console.error('[cron] processDistributionJobs failed:', e);
      return 0;
    });

    // 4. Snapshot queue AFTER for delta visibility.
    const queueAfter = await snapshotQueue();

    return NextResponse.json({
      ok: true,
      ticked: results.length,
      results,
      gen_jobs_ticked: genResults.length,
      gen_jobs_results: genResults,
      notified: notified.length,
      distributed,
      // Diagnostics added 2026-06-05 to make "ticked: 0 but queue not empty"
      // visible in one curl. If results=[] but candidates_examined>0, the
      // claim conditional UPDATE is rejecting because last_tick_at is fresh
      // — meaning a previous tick claimed these and didn't progress them.
      // If candidates_examined==0 but queue depth>0, the candidate query and
      // the depth metric disagree (status set drift).
      queue: {
        depth_before: queueBefore.depth,
        depth_after: queueAfter.depth,
        oldest_pending_age_sec_before: queueBefore.oldest_pending_age_sec,
        oldest_pending_age_sec_after: queueAfter.oldest_pending_age_sec,
        by_status_before: queueBefore.by_status,
        by_status_after: queueAfter.by_status,
      },
      zombies_expired: zombie.count,
      zombie_ids: zombie.ids,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
