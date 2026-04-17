/**
 * Cron: tick the Video Engine state machine.
 *
 * Picks up to N active runs (status NOT IN complete/failed) and advances each
 * by one stage. Authenticated by Vercel Cron header (or CRON_SECRET).
 *
 * Schedule (add to vercel.json):
 *   { "path": "/api/cron/video-engine-tick", "schedule": "*\/1 * * * *" }
 */
import { NextRequest, NextResponse } from 'next/server';
import { tickActiveRuns } from '@/lib/video-engine/pipeline';
import { notifyPendingRuns } from '@/lib/video-engine/notify';
import { processDistributionJobs } from '@/lib/video-engine/distribution';

export const runtime = 'nodejs';
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron')) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === 'development'; // only allow unauthenticated in local dev
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const max = Math.min(20, Math.max(1, Number(url.searchParams.get('max') ?? 5)));
  try {
    const results = await tickActiveRuns(max);
    // Safety-net sweep: catch any terminal-state runs whose in-line notify call
    // was lost (process restart, transient Resend failure, etc.).
    const notified = await notifyPendingRuns(10).catch((e) => {
      console.error('[cron] notifyPendingRuns failed:', e);
      return [];
    });
    const distributed = await processDistributionJobs(3).catch((e) => {
      console.error('[cron] processDistributionJobs failed:', e);
      return 0;
    });
    return NextResponse.json({
      ok: true,
      ticked: results.length,
      results,
      notified: notified.length,
      distributed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
