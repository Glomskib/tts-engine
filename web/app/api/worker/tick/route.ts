/**
 * User-driven worker tick — bypasses Vercel cron.
 *
 * Any logged-in user can hit this endpoint. It advances the video-engine queue
 * by one step (same work that /api/cron/video-engine-tick would do on a cron
 * schedule). Client-side polling on /studio, /create, /clips replaces the cron.
 *
 * Why: Vercel's CRON_SECRET binding is broken — every cron worker returns 401.
 * Rather than wait on Vercel support, we drive the queue from the user side.
 *
 * Safety:
 *   - Requires authenticated user (via getApiAuthContext)
 *   - Per-user rate limit: max 1 tick per 3 seconds per user
 *   - tickActiveRuns has a built-in claim model — concurrent calls don't
 *     double-process the same run.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { tickActiveRuns } from '@/lib/video-engine/pipeline';
import { notifyPendingRuns } from '@/lib/video-engine/notify';
import { runRenderChecks } from '@/lib/video-engine/run-render-checks';
import { tickGenerationJobs } from '@/lib/generation-jobs/worker';

export const runtime = 'nodejs';
export const maxDuration = 60;

// In-memory rate limit (per Vercel instance — good enough for our needs).
// Map from user.id → last-hit-timestamp.
const lastHitByUser = new Map<string, number>();
const RATE_LIMIT_MS = 3000;

// Periodic cleanup so the map doesn't grow unbounded
let lastCleanup = Date.now();
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, v] of lastHitByUser.entries()) {
    if (now - v > 5 * 60_000) lastHitByUser.delete(k);
  }
}

export async function GET(request: NextRequest) {
  return tick(request);
}

export async function POST(request: NextRequest) {
  return tick(request);
}

async function tick(request: NextRequest) {
  try {
    const auth = await getApiAuthContext(request);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    maybeCleanup();
    const now = Date.now();
    const last = lastHitByUser.get(auth.user.id) ?? 0;
    if (now - last < RATE_LIMIT_MS) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'rate_limited',
        retryAfterMs: RATE_LIMIT_MS - (now - last),
      });
    }
    lastHitByUser.set(auth.user.id, now);

    // Smaller batch per call than the cron — many users polling adds up.
    const url = new URL(request.url);
    const max = Math.min(10, Math.max(1, Number(url.searchParams.get('max') ?? 5)));

    const [tickResult, notifyResult, renderResult, genJobsResult] = await Promise.allSettled([
      tickActiveRuns(max),
      notifyPendingRuns(3),
      runRenderChecks(10),
      tickGenerationJobs(2),
    ]);

    const ticked = tickResult.status === 'fulfilled' ? tickResult.value.length : 0;
    const notified = notifyResult.status === 'fulfilled' ? notifyResult.value.length : 0;
    const rendersChecked = renderResult.status === 'fulfilled' ? renderResult.value.checked : 0;
    const genJobsTicked = genJobsResult.status === 'fulfilled' ? genJobsResult.value.length : 0;
    const genJobsErr = genJobsResult.status === 'rejected' ? String(genJobsResult.reason) : null;
    const tickErr = tickResult.status === 'rejected' ? String(tickResult.reason) : null;
    const notifyErr = notifyResult.status === 'rejected' ? String(notifyResult.reason) : null;
    const renderErr = renderResult.status === 'rejected' ? String(renderResult.reason) : null;

    return NextResponse.json({
      ok: true,
      ticked,
      notified,
      rendersChecked,
      genJobsTicked,
      ...(tickErr ? { tickError: tickErr } : {}),
      ...(notifyErr ? { notifyError: notifyErr } : {}),
      ...(renderErr ? { renderError: renderErr } : {}),
      ...(genJobsErr ? { genJobsError: genJobsErr } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
