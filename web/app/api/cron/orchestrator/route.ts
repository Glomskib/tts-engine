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
 * Every invocation is logged to ff_cron_runs for heartbeat monitoring.
 */
import { NextResponse } from 'next/server';
import { runOrchestrator } from '@/lib/command-center/orchestrator';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Insert heartbeat row (status=running)
  const requestId = request.headers.get('x-vercel-id') || crypto.randomUUID();
  const { data: cronRun } = await supabaseAdmin
    .from('ff_cron_runs')
    .insert({
      job: 'orchestrator',
      status: 'running',
      http_method: request.method,
      request_id: requestId,
    })
    .select('id')
    .single();

  const runId = cronRun?.id;

  try {
    const report = await runOrchestrator();

    const summary = report.passes.map((p) => `${p.pass}:${p.ok ? 'ok' : 'FAIL'}`).join(' | ');
    console.log(`[cron/orchestrator] ${summary}`);

    // Build meta from pass details
    const meta: Record<string, unknown> = {};
    for (const p of report.passes) {
      meta[p.pass] = p.detail;
    }

    // Update heartbeat row (status=ok)
    if (runId) {
      await supabaseAdmin
        .from('ff_cron_runs')
        .update({
          status: 'ok',
          finished_at: new Date().toISOString(),
          meta,
        })
        .eq('id', runId);
    }

    return NextResponse.json({
      ok: report.passes.every((p) => p.ok),
      ...report,
    });
  } catch (err) {
    console.error('[cron/orchestrator] Fatal:', err);

    // Update heartbeat row (status=error)
    if (runId) {
      await supabaseAdmin
        .from('ff_cron_runs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error: String(err),
        })
        .eq('id', runId);
    }

    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
