/**
 * Workflow Health Assessments
 *
 * Checks the operational health of critical FlashFlow workflows by querying
 * ff_cron_runs, jobs queue, and live data tables. Returns structured health
 * data with severity levels for the system-status API.
 *
 * Severity model:
 *   healthy  — working as expected
 *   degraded — partially working or stale
 *   critical — broken or not running
 *   unknown  — cannot determine (table missing, no data yet)
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type Severity = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface WorkflowCheck {
  name: string;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
}

export interface CronFreshness {
  job: string;
  label: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  recentFailures: number;
  severity: Severity;
  message: string;
}

export interface JobQueueHealth {
  pending: number;
  running: number;
  failed24h: number;
  oldestPendingAge: string | null;
  severity: Severity;
  message: string;
}

export interface WorkflowHealthReport {
  overallSeverity: Severity;
  workflows: WorkflowCheck[];
  cronFreshness: CronFreshness[];
  jobQueue: JobQueueHealth;
  warnings: string[];
}

// ── Freshness thresholds (in hours) ──────────────────────────────

interface FreshnessConfig {
  job: string;
  label: string;
  degradedAfterHours: number;
  criticalAfterHours: number;
}

const CRITICAL_CRONS: FreshnessConfig[] = [
  { job: 'orchestrator', label: 'Pipeline Orchestrator', degradedAfterHours: 0.5, criticalAfterHours: 1 },
  { job: 'process-jobs', label: 'Job Queue Processor', degradedAfterHours: 0.1, criticalAfterHours: 0.5 },
  { job: 'metrics-sync', label: 'Metrics Sync', degradedAfterHours: 2, criticalAfterHours: 6 },
  { job: 'drive-intake-poll', label: 'Drive Intake', degradedAfterHours: 1, criticalAfterHours: 4 },
  { job: 'sync-tiktok-videos', label: 'TikTok Video Sync', degradedAfterHours: 30, criticalAfterHours: 72 },
  { job: 'detect-winners', label: 'Winner Detection', degradedAfterHours: 12, criticalAfterHours: 48 },
  { job: 'radar-scan', label: 'Opportunity Radar', degradedAfterHours: 8, criticalAfterHours: 24 },
  { job: 'clip-discover', label: 'Clip Discovery', degradedAfterHours: 12, criticalAfterHours: 48 },
];

// ── Main assessment function ─────────────────────────────────────

export async function assessWorkflowHealth(): Promise<WorkflowHealthReport> {
  const warnings: string[] = [];

  const [cronFreshness, jobQueue, workflows] = await Promise.all([
    checkCronFreshness().catch(() => {
      warnings.push('Could not check cron freshness — ff_cron_runs table may not exist');
      return [] as CronFreshness[];
    }),
    checkJobQueue().catch(() => {
      warnings.push('Could not check job queue — jobs table may not exist');
      return { pending: 0, running: 0, failed24h: 0, oldestPendingAge: null, severity: 'unknown' as Severity, message: 'Job queue table not available' };
    }),
    checkWorkflows().catch(() => {
      warnings.push('Could not check workflow health');
      return [] as WorkflowCheck[];
    }),
  ]);

  // Compute overall severity
  const allSeverities = [
    ...cronFreshness.map(c => c.severity),
    jobQueue.severity,
    ...workflows.map(w => w.severity),
  ].filter(s => s !== 'unknown');

  let overallSeverity: Severity = 'healthy';
  if (allSeverities.includes('critical')) {
    overallSeverity = 'critical';
  } else if (allSeverities.includes('degraded')) {
    overallSeverity = 'degraded';
  } else if (allSeverities.length === 0) {
    overallSeverity = 'unknown';
  }

  return { overallSeverity, workflows, cronFreshness, jobQueue, warnings };
}

// ── Cron freshness checks ────────────────────────────────────────

async function checkCronFreshness(): Promise<CronFreshness[]> {
  const results: CronFreshness[] = [];
  const now = Date.now();

  // Batch query: get last run for each critical cron
  for (const config of CRITICAL_CRONS) {
    const [lastRunRes, recentFailRes] = await Promise.all([
      supabaseAdmin
        .from('ff_cron_runs')
        .select('started_at, status, error')
        .eq('job', config.job)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('ff_cron_runs')
        .select('id', { count: 'exact', head: true })
        .eq('job', config.job)
        .eq('status', 'error')
        .gte('started_at', new Date(now - 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const lastRun = lastRunRes.data;
    const recentFailures = recentFailRes.count ?? 0;

    if (!lastRun) {
      results.push({
        job: config.job,
        label: config.label,
        lastRunAt: null,
        lastStatus: null,
        lastError: null,
        recentFailures: 0,
        severity: 'unknown',
        message: 'Never run (no records in ff_cron_runs)',
      });
      continue;
    }

    const ageHours = (now - new Date(lastRun.started_at).getTime()) / (1000 * 60 * 60);
    let severity: Severity = 'healthy';
    let message = `Last run ${formatAge(ageHours)} ago`;

    if (lastRun.status === 'error') {
      severity = 'degraded';
      message = `Last run failed ${formatAge(ageHours)} ago: ${lastRun.error?.slice(0, 100) || 'unknown error'}`;
    }

    if (ageHours > config.criticalAfterHours) {
      severity = 'critical';
      message = `Not run in ${formatAge(ageHours)} — expected every ${config.degradedAfterHours < 1 ? `${Math.round(config.degradedAfterHours * 60)}min` : `${config.degradedAfterHours}h`}`;
    } else if (ageHours > config.degradedAfterHours) {
      severity = severity === 'healthy' ? 'degraded' : severity;
      if (severity === 'degraded' && lastRun.status !== 'error') {
        message = `Overdue — last run ${formatAge(ageHours)} ago`;
      }
    }

    if (recentFailures >= 3 && severity === 'healthy') {
      severity = 'degraded';
      message += ` (${recentFailures} failures in last 24h)`;
    }

    results.push({
      job: config.job,
      label: config.label,
      lastRunAt: lastRun.started_at,
      lastStatus: lastRun.status,
      lastError: lastRun.error,
      recentFailures,
      severity,
      message,
    });
  }

  return results;
}

// ── Job queue health ─────────────────────────────────────────────

async function checkJobQueue(): Promise<JobQueueHealth> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [pendingRes, runningRes, failedRes, oldestRes] = await Promise.all([
    supabaseAdmin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabaseAdmin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'running'),
    supabaseAdmin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', twentyFourHoursAgo),
    supabaseAdmin
      .from('jobs')
      .select('created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const pending = pendingRes.count ?? 0;
  const running = runningRes.count ?? 0;
  const failed24h = failedRes.count ?? 0;
  const oldestPendingAge = oldestRes.data?.created_at ?? null;

  let severity: Severity = 'healthy';
  let message = `${pending} pending, ${running} running`;

  if (failed24h > 0) {
    message += `, ${failed24h} failed in 24h`;
  }

  // Check for backlog
  if (oldestPendingAge) {
    const ageMinutes = (Date.now() - new Date(oldestPendingAge).getTime()) / (1000 * 60);
    if (ageMinutes > 60) {
      severity = 'critical';
      message = `Job backlog: oldest pending job is ${formatAge(ageMinutes / 60)} old. ${pending} pending, ${failed24h} failed in 24h`;
    } else if (ageMinutes > 15 || pending > 20) {
      severity = 'degraded';
      message = `Queue backing up: ${pending} pending (oldest ${Math.round(ageMinutes)}min). ${failed24h} failed in 24h`;
    }
  }

  if (failed24h >= 5 && severity === 'healthy') {
    severity = 'degraded';
  }

  return { pending, running, failed24h, oldestPendingAge, severity, message };
}

// ── Workflow-level checks ────────────────────────────────────────

async function checkWorkflows(): Promise<WorkflowCheck[]> {
  const checks: WorkflowCheck[] = [];

  // 1. TikTok Draft Export
  checks.push(await checkTikTokExport());

  // 2. Google Drive Intake
  checks.push(await checkDriveIntake());

  // 3. Email System
  checks.push(await checkEmailSystem());

  // 4. Content Pipeline
  checks.push(await checkContentPipeline());

  // 5. Webhook Delivery
  checks.push(await checkWebhookHealth());

  // 6. Metrics Freshness
  checks.push(await checkMetricsFreshness());

  // 7. Opportunity Radar
  checks.push(await checkRadarHealth());

  return checks;
}

async function checkTikTokExport(): Promise<WorkflowCheck> {
  const hasAppKey = !!process.env.TIKTOK_CONTENT_APP_KEY;
  if (!hasAppKey) {
    return { name: 'TikTok Draft Export', severity: 'unknown', message: 'Not configured — TIKTOK_CONTENT_APP_KEY not set' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('tiktok_content_connections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'connected');

    if (error) {
      return { name: 'TikTok Draft Export', severity: 'unknown', message: 'Cannot check — table query failed' };
    }

    const connections = data ? 1 : 0; // head:true returns null for data
    const count = (error ? 0 : (connections || 0));

    // Check recent export jobs
    const { data: recentExports } = await supabaseAdmin
      .from('jobs')
      .select('status, created_at')
      .eq('type', 'tiktok_draft_export')
      .order('created_at', { ascending: false })
      .limit(5);

    const recentFails = (recentExports ?? []).filter(j => j.status === 'failed').length;
    const lastExport = recentExports?.[0];

    if (count === 0 && !lastExport) {
      return { name: 'TikTok Draft Export', severity: 'degraded', message: 'Configured but no connected accounts or recent exports' };
    }

    if (recentFails >= 3) {
      return {
        name: 'TikTok Draft Export',
        severity: 'degraded',
        message: `${recentFails} of last 5 exports failed`,
        details: { recentFails, lastExportAt: lastExport?.created_at },
      };
    }

    return {
      name: 'TikTok Draft Export',
      severity: 'healthy',
      message: 'Connected and operational',
      details: { lastExportAt: lastExport?.created_at },
    };
  } catch {
    return { name: 'TikTok Draft Export', severity: 'unknown', message: 'Check failed' };
  }
}

async function checkDriveIntake(): Promise<WorkflowCheck> {
  const hasCredentials = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !!process.env.GOOGLE_CLIENT_ID;
  if (!hasCredentials) {
    return { name: 'Google Drive Intake', severity: 'unknown', message: 'Not configured — Google credentials not set' };
  }

  try {
    // Check last drive-intake-poll run
    const { data: lastPoll } = await supabaseAdmin
      .from('ff_cron_runs')
      .select('started_at, status, error')
      .eq('job', 'drive-intake-poll')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastPoll) {
      return { name: 'Google Drive Intake', severity: 'degraded', message: 'Configured but never polled (no run history)' };
    }

    const ageHours = (Date.now() - new Date(lastPoll.started_at).getTime()) / (1000 * 60 * 60);

    if (lastPoll.status === 'error') {
      return {
        name: 'Google Drive Intake',
        severity: 'degraded',
        message: `Last poll failed ${formatAge(ageHours)} ago: ${lastPoll.error?.slice(0, 80) || 'unknown'}`,
      };
    }

    if (ageHours > 4) {
      return { name: 'Google Drive Intake', severity: 'degraded', message: `Last poll was ${formatAge(ageHours)} ago — expected every 5 min` };
    }

    return { name: 'Google Drive Intake', severity: 'healthy', message: `Last poll ${formatAge(ageHours)} ago` };
  } catch {
    return { name: 'Google Drive Intake', severity: 'unknown', message: 'Check failed' };
  }
}

async function checkEmailSystem(): Promise<WorkflowCheck> {
  try {
    const { data: pendingEmails, error } = await supabaseAdmin
      .from('email_queue')
      .select('id', { count: 'exact', head: true })
      .eq('sent', false)
      .lt('send_at', new Date().toISOString());

    if (error) {
      // Table may not exist
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        return { name: 'Email System', severity: 'unknown', message: 'email_queue table not found' };
      }
      return { name: 'Email System', severity: 'unknown', message: 'Check failed' };
    }

    const overdue = pendingEmails ? 1 : 0; // head:true
    const count = error ? 0 : (overdue || 0);

    if (count > 10) {
      return { name: 'Email System', severity: 'critical', message: `${count} overdue unsent emails in queue` };
    }
    if (count > 0) {
      return { name: 'Email System', severity: 'degraded', message: `${count} overdue unsent email(s) in queue` };
    }

    return { name: 'Email System', severity: 'healthy', message: 'No overdue emails' };
  } catch {
    return { name: 'Email System', severity: 'unknown', message: 'Check failed' };
  }
}

async function checkContentPipeline(): Promise<WorkflowCheck> {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const [stuckRes, failedJobsRes] = await Promise.all([
      supabaseAdmin
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .eq('recording_status', 'AI_RENDERING')
        .lt('updated_at', twoHoursAgo),
      supabaseAdmin
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .in('type', ['generate_script', 'render_video', 'generate_editor_notes'])
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const stuck = stuckRes.count ?? 0;
    const failedJobs = failedJobsRes.count ?? 0;

    if (stuck > 3) {
      return { name: 'Content Pipeline', severity: 'critical', message: `${stuck} videos stuck in AI_RENDERING for 2+ hours`, details: { stuck, failedJobs } };
    }
    if (stuck > 0 || failedJobs > 3) {
      return { name: 'Content Pipeline', severity: 'degraded', message: `${stuck} stuck rendering, ${failedJobs} failed content jobs in 24h`, details: { stuck, failedJobs } };
    }

    return { name: 'Content Pipeline', severity: 'healthy', message: `No stuck items, ${failedJobs} failed jobs in 24h`, details: { stuck, failedJobs } };
  } catch {
    return { name: 'Content Pipeline', severity: 'unknown', message: 'Check failed' };
  }
}

async function checkWebhookHealth(): Promise<WorkflowCheck> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [failedRes, totalRes] = await Promise.all([
      supabaseAdmin
        .from('webhook_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('success', false)
        .gte('created_at', twentyFourHoursAgo),
      supabaseAdmin
        .from('webhook_deliveries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', twentyFourHoursAgo),
    ]);

    const failed = failedRes.count ?? 0;
    const total = totalRes.count ?? 0;

    if (total === 0) {
      return { name: 'Webhook Delivery', severity: 'healthy', message: 'No deliveries in 24h' };
    }

    const failRate = failed / total;
    if (failRate > 0.5) {
      return { name: 'Webhook Delivery', severity: 'critical', message: `${failed}/${total} deliveries failed in 24h (${Math.round(failRate * 100)}%)`, details: { failed, total } };
    }
    if (failed > 0) {
      return { name: 'Webhook Delivery', severity: 'degraded', message: `${failed}/${total} deliveries failed in 24h`, details: { failed, total } };
    }

    return { name: 'Webhook Delivery', severity: 'healthy', message: `${total} deliveries, all successful` };
  } catch {
    // Table may not exist
    return { name: 'Webhook Delivery', severity: 'unknown', message: 'Cannot check — table not available' };
  }
}

async function checkMetricsFreshness(): Promise<WorkflowCheck> {
  try {
    const { data: latestSnapshot } = await supabaseAdmin
      .from('content_item_metrics_snapshots')
      .select('captured_at')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestSnapshot) {
      return { name: 'Metrics Freshness', severity: 'unknown', message: 'No metrics snapshots found' };
    }

    const ageHours = (Date.now() - new Date(latestSnapshot.captured_at).getTime()) / (1000 * 60 * 60);

    if (ageHours > 72) {
      return {
        name: 'Metrics Freshness',
        severity: 'critical',
        message: `Metrics data is stale — last snapshot ${formatAge(ageHours)} ago`,
        details: { lastSnapshot: latestSnapshot.captured_at },
      };
    }
    if (ageHours > 36) {
      return {
        name: 'Metrics Freshness',
        severity: 'degraded',
        message: `Metrics data aging — last snapshot ${formatAge(ageHours)} ago`,
        details: { lastSnapshot: latestSnapshot.captured_at },
      };
    }

    return {
      name: 'Metrics Freshness',
      severity: 'healthy',
      message: `Last snapshot ${formatAge(ageHours)} ago`,
      details: { lastSnapshot: latestSnapshot.captured_at },
    };
  } catch {
    return { name: 'Metrics Freshness', severity: 'unknown', message: 'Cannot check — table not available' };
  }
}

async function checkRadarHealth(): Promise<WorkflowCheck> {
  try {
    const [lastScanRes, lastIngestRes, lastRescoreRes] = await Promise.all([
      supabaseAdmin
        .from('ff_cron_runs')
        .select('started_at, status, error')
        .eq('job', 'radar-scan')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('ff_cron_runs')
        .select('started_at, status')
        .eq('job', 'clip-discover')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('ff_cron_runs')
        .select('started_at, status')
        .eq('job', 'rescore-trends')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const scan = lastScanRes.data;
    const ingest = lastIngestRes.data;
    const rescore = lastRescoreRes.data;

    if (!scan) {
      return { name: 'Opportunity Radar', severity: 'unknown', message: 'Radar scans have not run (no records)' };
    }

    const scanAgeHours = (Date.now() - new Date(scan.started_at).getTime()) / (1000 * 60 * 60);
    let severity: Severity = 'healthy';
    const parts: string[] = [`Last scan ${formatAge(scanAgeHours)} ago`];

    if (scanAgeHours > 24) {
      severity = 'critical';
      parts[0] = `Radar scans have not run in ${formatAge(scanAgeHours)}`;
    } else if (scanAgeHours > 8 || scan.status === 'error') {
      severity = 'degraded';
      if (scan.status === 'error') parts.push(`last scan failed`);
    }

    if (ingest) {
      const ingestAge = (Date.now() - new Date(ingest.started_at).getTime()) / (1000 * 60 * 60);
      parts.push(`ingest ${formatAge(ingestAge)} ago`);
    }
    if (rescore) {
      const rescoreAge = (Date.now() - new Date(rescore.started_at).getTime()) / (1000 * 60 * 60);
      parts.push(`rescore ${formatAge(rescoreAge)} ago`);
    }

    return {
      name: 'Opportunity Radar',
      severity,
      message: parts.join(', '),
      details: {
        lastScan: scan.started_at,
        lastIngest: ingest?.started_at ?? null,
        lastRescore: rescore?.started_at ?? null,
      },
    };
  } catch {
    return { name: 'Opportunity Radar', severity: 'unknown', message: 'Check failed' };
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function formatAge(hours: number): string {
  if (hours < 1 / 60) return '<1min';
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours / 24 * 10) / 10}d`;
}
