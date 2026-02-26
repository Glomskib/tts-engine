/**
 * Cron: Orchestrator — Every 2 minutes
 *
 * Runs the 5-pass continuous orchestration loop:
 *   1. Brain Dispatch     (vault decisions → MC tasks)
 *   2. Feedback Enforce   (critical bugs → auto-escalated tasks)
 *   3. Stuck Recovery     (failed agent queue → retry)
 *   4. Executor Sync      (agent results → MC task status)
 *   5. Brain Writeback    (completed tasks → vault worklogs)
 *
 * Each pass is independently safe — one failure doesn't block the others.
 */
import { NextResponse } from 'next/server';
import { runOrchestrator } from '@/lib/command-center/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await runOrchestrator();

    const summary = report.passes.map((p) => `${p.pass}:${p.ok ? 'ok' : 'FAIL'}`).join(' | ');
    console.log(`[cron/orchestrator] ${summary}`);

    return NextResponse.json({
      ok: report.passes.every((p) => p.ok),
      ...report,
    });
  } catch (err) {
    console.error('[cron/orchestrator] Fatal:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
