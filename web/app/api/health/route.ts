import { NextResponse } from "next/server";
import { getEnvSummary } from "@/lib/env-validation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail';
  message?: string;
  responseTime?: number;
}

export async function GET() {
  const startTime = Date.now();
  const checks: HealthCheck[] = [];

  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Get environment validation summary
  const envSummary = getEnvSummary();

  // Environment check
  checks.push({
    name: 'environment',
    status: envSummary.env_ok ? 'pass' : 'fail',
    message: envSummary.env_ok ? undefined : `Missing ${envSummary.required_total - envSummary.required_present} required vars`,
  });

  // Database connectivity check
  const dbStart = Date.now();
  try {
    const { error } = await supabaseAdmin
      .from('user_subscriptions')
      .select('user_id')
      .limit(1);

    checks.push({
      name: 'database',
      status: error ? 'fail' : 'pass',
      message: error?.message,
      responseTime: Date.now() - dbStart,
    });
  } catch (err) {
    checks.push({
      name: 'database',
      status: 'fail',
      message: err instanceof Error ? err.message : 'Connection failed',
      responseTime: Date.now() - dbStart,
    });
  }

  // Stripe configuration check
  checks.push({
    name: 'stripe',
    status: process.env.STRIPE_SECRET_KEY ? 'pass' : 'fail',
    message: process.env.STRIPE_SECRET_KEY ? undefined : 'Not configured',
  });

  // Groq Whisper — transcription. Just env-check + quick HEAD; we don't burn
  // an API quota just for health checks.
  checks.push({
    name: 'groq',
    status: process.env.GROQ_API_KEY ? 'pass' : 'fail',
    message: process.env.GROQ_API_KEY ? undefined : 'GROQ_API_KEY missing — transcription falls back to OpenAI',
  });

  // Replicate — render compute
  checks.push({
    name: 'replicate',
    status: process.env.REPLICATE_API_TOKEN ? 'pass' : 'fail',
    message: process.env.REPLICATE_API_TOKEN ? undefined : 'REPLICATE_API_TOKEN missing — face-tracking + AI b-roll disabled',
  });

  // Anthropic — hook ranker
  checks.push({
    name: 'anthropic',
    status: process.env.ANTHROPIC_API_KEY ? 'pass' : 'fail',
    message: process.env.ANTHROPIC_API_KEY ? undefined : 'ANTHROPIC_API_KEY missing — hook ranker falls back to deterministic',
  });

  // R2 — storage
  const r2Configured = !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
                       && process.env.R2_ENDPOINT && process.env.R2_BUCKET);
  checks.push({
    name: 'r2_storage',
    status: r2Configured ? 'pass' : 'fail',
    message: r2Configured ? undefined : 'R2 not configured — uploads fall back to Supabase Storage (50MB cap)',
  });

  // Pexels — B-roll
  checks.push({
    name: 'pexels',
    status: process.env.PEXELS_API_KEY ? 'pass' : 'fail',
    message: process.env.PEXELS_API_KEY ? undefined : 'PEXELS_API_KEY missing — B-roll cutaways disabled',
  });

  // Stripe webhook signing secret — critical for production
  checks.push({
    name: 'stripe_webhook_secret',
    status: process.env.STRIPE_WEBHOOK_SECRET_CREATE ? 'pass' : 'fail',
    message: process.env.STRIPE_WEBHOOK_SECRET_CREATE
      ? undefined
      : 'STRIPE_WEBHOOK_SECRET_CREATE missing — webhook accepts unsigned events (forgery risk)',
  });

  // ve_runs queue depth — early warning for pipeline backlog
  const queueStart = Date.now();
  try {
    const { count: pendingCount } = await supabaseAdmin
      .from('ve_runs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['created', 'transcribing', 'analyzing', 'assembling', 'rendering']);

    const depth = pendingCount ?? 0;
    // Yellow at 50 in queue, red at 200 (we process up to 25/min = backlog
    // means we're losing the race against incoming jobs).
    let qStatus: 'pass' | 'fail' = 'pass';
    let qMsg: string | undefined;
    if (depth > 200) { qStatus = 'fail'; qMsg = `Queue depth ${depth} — pipeline backlog`; }
    else if (depth > 50) { qMsg = `Queue depth ${depth} — busy but OK`; }
    checks.push({
      name: 'pipeline_queue',
      status: qStatus,
      message: qMsg,
      responseTime: Date.now() - queueStart,
    });
  } catch (err) {
    checks.push({
      name: 'pipeline_queue',
      status: 'fail',
      message: err instanceof Error ? err.message : 'queue check failed',
      responseTime: Date.now() - queueStart,
    });
  }

  // Determine overall status
  const failedChecks = checks.filter((c) => c.status === 'fail');
  const dbFailed = failedChecks.some((c) => c.name === 'database');

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (dbFailed) {
    status = 'unhealthy';
  } else if (failedChecks.length > 0) {
    status = 'degraded';
  }

  const response = {
    ok: status !== 'unhealthy',
    status,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    checks,
    // Backward compatible fields
    env: {
      NEXT_PUBLIC_SUPABASE_URL: hasSupabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: hasAnonKey,
      SUPABASE_SERVICE_ROLE_KEY: hasServiceKey
    },
    SUPABASE_SERVICE_ROLE_KEY_PRESENT: hasServiceKey,
    USING_SERVICE_ROLE_FOR_ADMIN: hasServiceKey,
    // New env_report summary (additive)
    env_report: {
      env_ok: envSummary.env_ok,
      required_present: envSummary.required_present,
      required_total: envSummary.required_total,
      optional_present: envSummary.optional_present,
      optional_total: envSummary.optional_total,
    },
  };

  return NextResponse.json(response, {
    status: status === 'unhealthy' ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store',
      'X-Response-Time': `${Date.now() - startTime}ms`,
    },
  });
}
// cron-secret-applied: 1778970937
// cron-secret-final: 1778971270
// post-payment-rebuild: 1778976104
