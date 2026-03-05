/**
 * Cron: Process Background Jobs
 *
 * Runs every minute. Polls pending jobs from the jobs table,
 * executes handlers, and updates status with retry support.
 * Protected by CRON_SECRET.
 */

import { NextResponse } from 'next/server';
import { processJobs } from '@/lib/jobs';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LOG = '[cron/process-jobs]';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const result = await processJobs();
    const durationMs = Date.now() - startedAt;

    if (result.processed > 0) {
      console.log(`${LOG} ${durationMs}ms — processed=${result.processed} completed=${result.completed} failed=${result.failed} retried=${result.retried}`);
    }

    return NextResponse.json({ ok: true, ...result, duration_ms: durationMs });
  } catch (err) {
    console.error(`${LOG} Fatal error:`, err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
