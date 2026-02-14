import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

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

interface SystemStatusResponse {
  ok: true;
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceCheck[];
  pipeline: PipelineHealth;
  usage: UsageStats;
  cronJobs: CronJob[];
  totalLatency: number;
  timestamp: string;
}

const CRON_JOBS: CronJob[] = [
  { path: '/api/cron/check-renders', schedule: '*/2 * * * *', description: 'Check video render status (every 2 min)' },
  { path: '/api/jobs/generate-scripts', schedule: '*/5 * * * *', description: 'Process script generation queue (every 5 min)' },
  { path: '/api/cron/nightly-reset', schedule: '5 5 * * *', description: 'Nightly cleanup and reset (5:05 AM UTC)' },
  { path: '/api/cron/process-emails', schedule: '0 */6 * * *', description: 'Process inbound emails (every 6 hours)' },
  { path: '/api/cron/daily-digest', schedule: '0 14 * * *', description: 'Send daily digest notifications (2 PM UTC)' },
  { path: '/api/cron/auto-post', schedule: '*/15 * * * *', description: 'Auto-post scheduled content (every 15 min)' },
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

  const [services, pipeline, usage] = await Promise.all([
    checkAllServices(),
    checkPipelineHealth(),
    checkUsageStats(),
  ]);

  // Overall status
  const hasUnhealthy = services.some(s => s.status === 'unhealthy');
  const hasDegraded = services.some(s => s.status === 'degraded');
  const hasPipelineIssues = pipeline.stuckRendering > 0 || pipeline.stuckReview > 5;

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (hasUnhealthy || (pipeline.stuckRendering > 3)) {
    status = 'unhealthy';
  } else if (hasDegraded || hasPipelineIssues) {
    status = 'degraded';
  }

  const response: SystemStatusResponse = {
    ok: true,
    status,
    services,
    pipeline,
    usage,
    cronJobs: CRON_JOBS,
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
