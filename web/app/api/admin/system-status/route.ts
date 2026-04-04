import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { assessWorkflowHealth, type WorkflowHealthReport } from '@/lib/ops/workflow-health';
import { getEnvSummary, checkFeatureConfig } from '@/lib/env-validation';

export const runtime = 'nodejs';
export const maxDuration = 30;

type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'not_configured';

interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latency?: number;
  message?: string;
  details?: string;
}

interface PipelineHealth {
  stuckRendering: number;
  stuckReview: number;
  failedLast24h: number;
}

interface UsageStats {
  totalUsers: number;
  activeThisWeek: number;
  creditsConsumedToday: number;
}

interface CronJob {
  path: string;
  schedule: string;
  description: string;
}

interface MetricsSystemHealth {
  providers: {
    internal_lookup: { enabled: boolean; platform: string; description: string };
    posting_provider: { enabled: boolean; reason: string };
    scrape_lite: { enabled: boolean; reason: string };
  };
  lastSnapshot: string | null;
  totalSnapshots: number;
  postsWithMetrics: number;
  postsWithoutMetrics: number;
}

interface EnvBootStatus {
  env_ok: boolean;
  required_present: number;
  required_total: number;
  optional_present: number;
  optional_total: number;
  integrations: { system: string; configured: boolean; missing: string[] }[];
}

interface SystemStatusResponse {
  ok: true;
  status: 'healthy' | 'degraded' | 'unhealthy';
  envBoot: EnvBootStatus;
  services: ServiceCheck[];
  pipeline: PipelineHealth;
  usage: UsageStats;
  cronJobs: CronJob[];
  metricsSystem: MetricsSystemHealth;
  workflowHealth: WorkflowHealthReport;
  totalLatency: number;
  timestamp: string;
}

const CRON_JOBS: CronJob[] = [
  // High-frequency (every 1-2 min)
  { path: '/api/cron/process-jobs', schedule: '* * * * *', description: 'Job queue processor (every minute)' },
  { path: '/api/cron/check-renders', schedule: '*/2 * * * *', description: 'Check video render status (every 2 min)' },
  { path: '/api/cron/orchestrator', schedule: '*/2 * * * *', description: 'Pipeline orchestrator (every 2 min)' },
  { path: '/api/cron/brain-dispatch', schedule: '*/2 * * * *', description: 'Decision→task dispatch (every 2 min)' },
  // Medium-frequency (every 5-15 min)
  { path: '/api/cron/drive-intake-poll', schedule: '*/5 * * * *', description: 'Google Drive intake poll (every 5 min)' },
  { path: '/api/cron/drive-intake-worker', schedule: '*/5 * * * *', description: 'Google Drive intake worker (every 5 min)' },
  { path: '/api/cron/content-item-processing', schedule: '*/5 * * * *', description: 'Content item pipeline (every 5 min)' },
  { path: '/api/cron/auto-post', schedule: '*/15 * * * *', description: 'Auto-post scheduled content (every 15 min)' },
  { path: '/api/cron/posting-reminders', schedule: '*/15 * * * *', description: 'Posting reminders (every 15 min)' },
  { path: '/api/cron/triage-issues', schedule: '*/15 * * * *', description: 'Triage support issues (every 15 min)' },
  { path: '/api/cron/marketing-scheduler', schedule: '*/15 * * * *', description: 'Marketing post scheduler (every 15 min)' },
  { path: '/api/cron/analyze-videos', schedule: '*/15 * * * *', description: 'Video analysis queue (every 15 min)' },
  // Low-frequency (30 min - 6 hours)
  { path: '/api/cron/metrics-sync', schedule: '*/30 * * * *', description: 'Metrics sync — internal_lookup via tiktok_videos (every 30 min)' },
  { path: '/api/cron/clip-analyze', schedule: '15 * * * *', description: 'Clip analysis (hourly at :15)' },
  { path: '/api/cron/radar-scan', schedule: '0 */4 * * *', description: 'Opportunity radar scan (every 4 hours)' },
  { path: '/api/cron/process-emails', schedule: '0 */6 * * *', description: 'Process email queue (every 6 hours)' },
  { path: '/api/cron/discord-role-sync', schedule: '0 */6 * * *', description: 'Discord role sync (every 6 hours)' },
  { path: '/api/cron/clip-discover', schedule: '0 */6 * * *', description: 'Clip discovery (every 6 hours)' },
  { path: '/api/cron/detect-winners', schedule: '0 */6 * * *', description: 'Winner pattern detection (every 6 hours)' },
  { path: '/api/cron/marketing-health', schedule: '0 */6 * * *', description: 'Marketing health probe (every 6 hours)' },
  { path: '/api/cron/rescore-trends', schedule: '30 */6 * * *', description: 'Rescore trend freshness (every 6 hours)' },
  // Daily
  { path: '/api/cron/build-creator-dna', schedule: '0 5 * * *', description: 'Creator DNA aggregation (5 AM UTC)' },
  { path: '/api/cron/sync-tiktok-videos', schedule: '0 6 * * *', description: 'Sync TikTok video catalog (6 AM UTC)' },
  { path: '/api/cron/finops-daily', schedule: '0 6 * * *', description: 'FinOps daily report (6 AM UTC)' },
  { path: '/api/cron/sync-tiktok-sales', schedule: '0 7 * * *', description: 'TikTok Shop sales sync (7 AM UTC)' },
  { path: '/api/cron/retainer-check', schedule: '0 13 * * *', description: 'Client retainer check (1 PM UTC)' },
  { path: '/api/cron/daily-virals', schedule: '30 13 * * *', description: 'Daily viral content scan (1:30 PM UTC)' },
  { path: '/api/cron/daily-digest', schedule: '0 14 * * *', description: 'Daily digest notification (2 PM UTC)' },
  { path: '/api/cron/script-of-the-day', schedule: '0 15 * * *', description: 'Script of the day (3 PM UTC)' },
  // Weekly
  { path: '/api/cron/weekly-digest', schedule: '0 16 * * 1', description: 'Weekly digest (Mon 4 PM UTC)' },
  { path: '/api/cron/weekly-trainer', schedule: '0 17 * * 1', description: 'Weekly training update (Mon 5 PM UTC)' },
  { path: '/api/cron/weekly-support-report', schedule: '30 17 * * 1', description: 'Weekly support report (Mon 5:30 PM UTC)' },
  { path: '/api/cron/weekly-report-card', schedule: '0 18 * * 1', description: 'User weekly report card (Mon 6 PM UTC)' },
  { path: '/api/cron/weekly-summaries', schedule: '30 18 * * 1', description: 'Strategy optimization summaries (Mon 6:30 PM UTC)' },
  { path: '/api/cron/finops-weekly', schedule: '30 6 * * 1', description: 'FinOps weekly report (Mon 6:30 AM UTC)' },
  // Monthly
  { path: '/api/cron/process-payouts', schedule: '0 8 1 * *', description: 'Affiliate payouts via Stripe Connect (1st of month, 8 AM UTC)' },
  // Maintenance
  { path: '/api/cron/cleanup-webhook-events', schedule: '0 4 * * 0', description: 'Webhook event cleanup (Sun 4 AM UTC)' },
];

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const startTime = Date.now();

  // Env boot status (synchronous, no I/O)
  const envSummary = getEnvSummary();
  const INTEGRATION_SYSTEMS = [
    'Stripe', 'TikTok', 'TikTok Content', 'Google Drive', 'HeyGen',
    'Shotstack', 'Runway', 'OpenClaw', 'Telegram', 'Email', 'Late.dev',
    'Mission Control', 'Discord',
  ];
  const integrations = INTEGRATION_SYSTEMS.map(sys => {
    const check = checkFeatureConfig(sys);
    return { system: sys, configured: check.configured, missing: check.missing };
  });
  const envBoot: EnvBootStatus = {
    ...envSummary,
    integrations,
  };

  const [services, pipeline, usage, metricsSystem, workflowHealth] = await Promise.all([
    checkAllServices(),
    checkPipelineHealth(),
    checkUsageStats(),
    checkMetricsSystem(),
    assessWorkflowHealth(),
  ]);

  // Overall status
  const hasUnhealthy = services.some(s => s.status === 'unhealthy');
  const hasDegraded = services.some(s => s.status === 'degraded');
  const hasPipelineIssues = pipeline.stuckRendering > 0 || pipeline.stuckReview > 5;

  const workflowCritical = workflowHealth.overallSeverity === 'critical';
  const workflowDegraded = workflowHealth.overallSeverity === 'degraded';

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (hasUnhealthy || (pipeline.stuckRendering > 3) || workflowCritical) {
    status = 'unhealthy';
  } else if (hasDegraded || hasPipelineIssues || workflowDegraded) {
    status = 'degraded';
  }

  const response: SystemStatusResponse = {
    ok: true,
    status,
    envBoot,
    services,
    pipeline,
    usage,
    cronJobs: CRON_JOBS,
    metricsSystem,
    workflowHealth,
    totalLatency: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(response);
}

async function checkAllServices(): Promise<ServiceCheck[]> {
  const results = await Promise.allSettled([
    checkSupabase(),
    checkHeyGen(),
    checkElevenLabs(),
    checkRunway(),
    checkShotstack(),
    checkTikTokConnections(),
    checkTikwm(),
    checkStripe(),
    checkOpenClaw(),
  ]);

  return results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { name: 'Unknown', status: 'unhealthy' as ServiceStatus, message: 'Check failed' }
  );
}

async function checkSupabase(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(5000));

    if (error) {
      return { name: 'Supabase DB', status: 'unhealthy', latency: Date.now() - start, message: error.message };
    }
    return { name: 'Supabase DB', status: 'healthy', latency: Date.now() - start };
  } catch (err) {
    return {
      name: 'Supabase DB',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

async function checkHeyGen(): Promise<ServiceCheck> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return { name: 'HeyGen', status: 'not_configured', message: 'API key not set' };
  }

  const start = Date.now();
  try {
    const res = await fetch('https://api.heygen.com/v2/user/remaining_quota', {
      headers: { 'X-Api-Key': apiKey },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        name: 'HeyGen',
        status: res.status === 401 ? 'unhealthy' : 'degraded',
        latency: Date.now() - start,
        message: `HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const remaining = data?.data?.remaining_quota ?? data?.remaining_quota;
    return {
      name: 'HeyGen',
      status: 'healthy',
      latency: Date.now() - start,
      details: remaining != null ? `${remaining} credits remaining` : undefined,
    };
  } catch (err) {
    return {
      name: 'HeyGen',
      status: 'degraded',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Request failed',
    };
  }
}

async function checkElevenLabs(): Promise<ServiceCheck> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { name: 'ElevenLabs', status: 'not_configured', message: 'API key not set' };
  }

  const start = Date.now();
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        name: 'ElevenLabs',
        status: res.status === 401 ? 'unhealthy' : 'degraded',
        latency: Date.now() - start,
        message: `HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const used = data?.character_count ?? 0;
    const limit = data?.character_limit ?? 0;
    return {
      name: 'ElevenLabs',
      status: 'healthy',
      latency: Date.now() - start,
      details: `${(limit - used).toLocaleString()} chars remaining`,
    };
  } catch (err) {
    return {
      name: 'ElevenLabs',
      status: 'degraded',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Request failed',
    };
  }
}

async function checkRunway(): Promise<ServiceCheck> {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    return { name: 'Runway', status: 'not_configured', message: 'API key not set' };
  }

  const start = Date.now();
  try {
    const res = await fetch('https://api.dev.runwayml.com/v1/tasks?limit=1', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        name: 'Runway',
        status: res.status === 401 ? 'unhealthy' : 'degraded',
        latency: Date.now() - start,
        message: `HTTP ${res.status}`,
      };
    }

    return { name: 'Runway', status: 'healthy', latency: Date.now() - start };
  } catch (err) {
    return {
      name: 'Runway',
      status: 'degraded',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Request failed',
    };
  }
}

async function checkShotstack(): Promise<ServiceCheck> {
  const env = (process.env.SHOTSTACK_ENV || 'sandbox') as 'sandbox' | 'production';
  const apiKey = env === 'production'
    ? process.env.SHOTSTACK_PRODUCTION_KEY
    : process.env.SHOTSTACK_SANDBOX_KEY;

  if (!apiKey) {
    return { name: 'Shotstack', status: 'not_configured', message: 'API key not set' };
  }

  const baseUrl = env === 'production'
    ? 'https://api.shotstack.io/edit/v1'
    : 'https://api.shotstack.io/edit/stage';

  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/render`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(5000),
    });

    // Shotstack returns 400 for GET on /render (expects POST) but proves reachability
    // A 401/403 means bad key
    if (res.status === 401 || res.status === 403) {
      return {
        name: 'Shotstack',
        status: 'unhealthy',
        latency: Date.now() - start,
        message: 'Invalid API key',
      };
    }

    return {
      name: 'Shotstack',
      status: 'healthy',
      latency: Date.now() - start,
      details: `env: ${env}`,
    };
  } catch (err) {
    return {
      name: 'Shotstack',
      status: 'degraded',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Request failed',
    };
  }
}

async function checkTikTokConnections(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const { data, error } = await supabaseAdmin
      .from('tiktok_content_connections')
      .select('id', { count: 'exact' })
      .eq('status', 'connected')
      .abortSignal(AbortSignal.timeout(5000));

    if (error) {
      // Table may not exist yet
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        return { name: 'TikTok Content', status: 'not_configured', message: 'Table not found' };
      }
      return {
        name: 'TikTok Content',
        status: 'degraded',
        latency: Date.now() - start,
        message: error.message,
      };
    }

    const count = data?.length ?? 0;
    return {
      name: 'TikTok Content',
      status: count > 0 ? 'healthy' : 'degraded',
      latency: Date.now() - start,
      details: `${count} connected account${count !== 1 ? 's' : ''}`,
    };
  } catch (err) {
    return {
      name: 'TikTok Content',
      status: 'degraded',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Query failed',
    };
  }
}

async function checkTikwm(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const res = await fetch('https://www.tikwm.com/api/', {
      signal: AbortSignal.timeout(5000),
    });

    return {
      name: 'tikwm',
      status: res.ok ? 'healthy' : 'degraded',
      latency: Date.now() - start,
      message: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      name: 'tikwm',
      status: 'degraded',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unreachable',
    };
  }
}

async function checkStripe(): Promise<ServiceCheck> {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    return { name: 'Stripe', status: 'not_configured', message: 'API key not set' };
  }

  const start = Date.now();
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        name: 'Stripe',
        status: res.status === 401 ? 'unhealthy' : 'degraded',
        latency: Date.now() - start,
        message: `HTTP ${res.status}`,
      };
    }

    return { name: 'Stripe', status: 'healthy', latency: Date.now() - start };
  } catch (err) {
    return {
      name: 'Stripe',
      status: 'degraded',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Request failed',
    };
  }
}

async function checkOpenClaw(): Promise<ServiceCheck> {
  const apiUrl = process.env.OPENCLAW_API_URL;
  const apiKey = process.env.OPENCLAW_API_KEY;
  if (!apiUrl || !apiKey) {
    return { name: 'OpenClaw', status: 'not_configured', message: 'API URL or key not set' };
  }

  if (process.env.OPENCLAW_ENABLED === 'false') {
    return { name: 'OpenClaw', status: 'not_configured', message: 'Disabled via OPENCLAW_ENABLED=false' };
  }

  const start = Date.now();
  try {
    // Use a lightweight endpoint to verify connectivity
    const res = await fetch(`${apiUrl}/api/health`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        name: 'OpenClaw',
        status: res.status === 401 ? 'unhealthy' : 'degraded',
        latency: Date.now() - start,
        message: `HTTP ${res.status}`,
      };
    }

    return { name: 'OpenClaw', status: 'healthy', latency: Date.now() - start };
  } catch (err) {
    return {
      name: 'OpenClaw',
      status: 'degraded',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Request failed',
    };
  }
}

async function checkPipelineHealth(): Promise<PipelineHealth> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [stuckRenderingRes, stuckReviewRes, failedRes] = await Promise.all([
    supabaseAdmin
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('recording_status', 'AI_RENDERING')
      .lt('updated_at', twoHoursAgo),
    supabaseAdmin
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('recording_status', 'READY_FOR_REVIEW')
      .lt('updated_at', twentyFourHoursAgo),
    supabaseAdmin
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('recording_status', 'REJECTED')
      .gt('updated_at', twentyFourHoursAgo),
  ]);

  return {
    stuckRendering: stuckRenderingRes.count ?? 0,
    stuckReview: stuckReviewRes.count ?? 0,
    failedLast24h: failedRes.count ?? 0,
  };
}

async function checkUsageStats(): Promise<UsageStats> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const [usersRes, activeRes, creditsRes] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ perPage: 1, page: 1 }),
    supabaseAdmin
      .from('user_activity')
      .select('user_id')
      .gt('created_at', sevenDaysAgo),
    supabaseAdmin
      .from('credit_transactions')
      .select('amount')
      .eq('type', 'generation')
      .gt('created_at', todayISO),
  ]);

  // Total users — the API returns total in a nested field
  // listUsers with perPage=1 still gives us the total count
  const totalUsers = (usersRes.data as { users: unknown[] })?.users?.length ?? 0;

  // Active users — deduplicate
  const activeUserIds = new Set(
    (activeRes.data ?? []).map((r: { user_id: string }) => r.user_id)
  );

  // Credits consumed today
  const creditsToday = (creditsRes.data ?? []).reduce(
    (sum: number, r: { amount: number }) => sum + Math.abs(r.amount),
    0
  );

  return {
    totalUsers,
    activeThisWeek: activeUserIds.size,
    creditsConsumedToday: creditsToday,
  };
}

async function checkMetricsSystem(): Promise<MetricsSystemHealth> {
  try {
    const [snapshotRes, postsWithRes, postsWithoutRes] = await Promise.all([
      // Latest snapshot
      supabaseAdmin
        .from('content_item_metrics_snapshots')
        .select('captured_at', { count: 'exact' })
        .order('captured_at', { ascending: false })
        .limit(1),
      // Posts with at least one snapshot
      supabaseAdmin.rpc('count_posts_with_metrics').maybeSingle(),
      // Posts without any snapshots
      supabaseAdmin
        .from('content_item_posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'posted'),
    ]);

    const lastSnapshot = snapshotRes.data?.[0]?.captured_at ?? null;
    const totalSnapshots = snapshotRes.count ?? 0;

    // postsWithMetrics: use RPC if available, otherwise estimate from snapshot count
    const postsWithMetrics = typeof postsWithRes?.data === 'number'
      ? postsWithRes.data
      : Math.min(totalSnapshots, postsWithoutRes.count ?? 0);
    const totalPosts = postsWithoutRes.count ?? 0;

    return {
      providers: {
        internal_lookup: {
          enabled: true,
          platform: 'tiktok',
          description: 'Bridges tiktok_videos table (synced daily by sync-tiktok-videos cron)',
        },
        posting_provider: {
          enabled: false,
          reason: 'Late.dev analytics returns aggregate data, not per-post metrics',
        },
        scrape_lite: {
          enabled: false,
          reason: 'Requires headless browser infrastructure — not available in serverless',
        },
      },
      lastSnapshot,
      totalSnapshots,
      postsWithMetrics,
      postsWithoutMetrics: totalPosts - postsWithMetrics,
    };
  } catch {
    // Tables may not exist yet
    return {
      providers: {
        internal_lookup: {
          enabled: true,
          platform: 'tiktok',
          description: 'Bridges tiktok_videos table (synced daily by sync-tiktok-videos cron)',
        },
        posting_provider: {
          enabled: false,
          reason: 'Late.dev analytics returns aggregate data, not per-post metrics',
        },
        scrape_lite: {
          enabled: false,
          reason: 'Requires headless browser infrastructure — not available in serverless',
        },
      },
      lastSnapshot: null,
      totalSnapshots: 0,
      postsWithMetrics: 0,
      postsWithoutMetrics: 0,
    };
  }
}
