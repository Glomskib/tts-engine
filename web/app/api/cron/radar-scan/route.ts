/**
 * Cron: Radar Scan Scheduler
 *
 * Runs periodically. Finds creator_sources due for scanning and enqueues
 * scan_creator jobs for each. Protected by CRON_SECRET.
 *
 * Dedup: Skips sources that already have a pending/running scan_creator job
 * to prevent duplicate work.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getDueScans } from '@/lib/opportunity-radar/scheduler';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { checkAndSendFailureAlert } from '@/lib/ops/failure-alert';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LOG = '[cron/radar-scan]';

/** Max jobs to enqueue per cron tick */
const MAX_ENQUEUE_PER_TICK = 20;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const dueSources = await getDueScans(MAX_ENQUEUE_PER_TICK);

    if (dueSources.length === 0) {
      return NextResponse.json({ ok: true, enqueued: 0, skipped: 0, duration_ms: Date.now() - startedAt });
    }

    // Check for existing active (pending/running) scan jobs to prevent duplicates
    const sourceIds = dueSources.map((s) => s.id);
    const { data: activeJobs } = await supabaseAdmin
      .from('jobs')
      .select('payload')
      .eq('type', 'scan_creator')
      .in('status', ['pending', 'running']);

    const activeSourceIds = new Set(
      (activeJobs ?? [])
        .map((j) => (j.payload as Record<string, unknown>)?.creator_source_id as string)
        .filter(Boolean),
    );

    let enqueued = 0;
    let skipped = 0;

    for (const source of dueSources) {
      // Skip if there's already an active job for this source
      if (activeSourceIds.has(source.id)) {
        skipped++;
        continue;
      }

      const jobId = await enqueueJob(
        'system',
        'scan_creator',
        {
          creator_source_id: source.id,
          platform: source.platform,
          handle: source.handle,
          scan_reason: 'scheduled',
        },
        2,
      );
      if (jobId) enqueued++;
    }

    const durationMs = Date.now() - startedAt;
    if (enqueued > 0 || skipped > 0) {
      console.log(`${LOG} ${durationMs}ms — due=${dueSources.length} enqueued=${enqueued} skipped=${skipped}`);
    }

    return NextResponse.json({
      ok: true,
      due: dueSources.length,
      enqueued,
      skipped,
      duration_ms: durationMs,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`${LOG} Fatal error:`, err);
    await checkAndSendFailureAlert({
      source: 'radar-scan',
      error: errorMsg,
      cooldownMinutes: 30,
      context: { route: '/api/cron/radar-scan' },
    });
    return NextResponse.json(
      { ok: false, error: errorMsg },
      { status: 500 },
    );
  }
}
