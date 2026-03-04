/**
 * GET /api/admin/command-center/ops-health
 *
 * Owner-only ops health endpoint.
 * Returns job health with source attribution, failure alerts,
 * auto-draft cap status, dispatch history, and env modes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkHourlyCap } from '@/lib/ops/cost-caps';

export const runtime = 'nodejs';

const TRACKED_JOBS = [
  'ri_ingestion',
  'nightly_draft',
  'orchestrator',
  'clip-discover',
  'clip-analyze',
];

interface RunRow {
  id: string;
  job: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  error: string | null;
  meta: Record<string, unknown>;
  run_source: string | null;
  requested_by: string | null;
}

interface JobHealth {
  job: string;
  last_run: RunRow | null;
  recent_runs: RunRow[];
  success_rate: number;
  healthy: boolean;
  source_breakdown: Record<string, number>;
}

export async function GET(request: NextRequest) {
  const ownerCheck = await requireOwner(request);
  if (ownerCheck) return ownerCheck;

  // Fetch recent runs for all tracked jobs (last 10 each)
  const { data: allRuns } = await supabaseAdmin
    .from('ff_cron_runs')
    .select('*')
    .in('job', TRACKED_JOBS)
    .order('started_at', { ascending: false })
    .limit(200);

  const runs = (allRuns ?? []) as RunRow[];

  // Build per-job health
  const jobs: JobHealth[] = TRACKED_JOBS.map((job) => {
    const jobRuns = runs
      .filter((r) => r.job === job)
      .slice(0, 10);

    const lastRun = jobRuns[0] ?? null;
    const completed = jobRuns.filter((r) => r.status !== 'running');
    const ok = completed.filter((r) => r.status === 'ok').length;
    const successRate = completed.length > 0 ? ok / completed.length : 1;

    const healthy = lastRun
      ? lastRun.status === 'ok' || (lastRun.status === 'running' && successRate > 0.5)
      : true;

    // Source breakdown: count runs by run_source
    const sourceBreakdown: Record<string, number> = {};
    for (const r of jobRuns) {
      const src = r.run_source ?? 'unknown';
      sourceBreakdown[src] = (sourceBreakdown[src] ?? 0) + 1;
    }

    return {
      job,
      last_run: lastRun,
      recent_runs: jobRuns,
      success_rate: Math.round(successRate * 100),
      healthy,
      source_breakdown: sourceBreakdown,
    };
  });

  // Fetch recent failure alerts
  const { data: alertRuns } = await supabaseAdmin
    .from('ff_cron_runs')
    .select('*')
    .like('job', 'failure_alert:%')
    .order('started_at', { ascending: false })
    .limit(20);

  // Fetch recent dispatch records
  const { data: dispatchRuns } = await supabaseAdmin
    .from('ff_cron_runs')
    .select('*')
    .like('job', 'dispatch:%')
    .order('started_at', { ascending: false })
    .limit(20);

  // Cap status
  const cap = await checkHourlyCap();

  // Env modes
  const envModes = {
    ri_auto_draft: process.env.RI_AUTO_DRAFT === 'true',
    reminders_enabled: process.env.REMINDERS_ENABLED === 'true' || process.env.REMINDERS_ENABLED === '1',
    ri_max_ai_drafts_per_hour: parseInt(process.env.RI_MAX_AI_DRAFTS_PER_HOUR ?? '20', 10),
    node_id: process.env.FF_NODE_ID ?? null,
  };

  const overallHealthy = jobs.every((j) => j.healthy);

  return NextResponse.json({
    ok: true,
    overall_healthy: overallHealthy,
    jobs,
    failure_alerts: (alertRuns ?? []) as RunRow[],
    dispatches: (dispatchRuns ?? []) as RunRow[],
    cap,
    env_modes: envModes,
    fetched_at: new Date().toISOString(),
  });
}
