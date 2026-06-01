import { NextResponse } from "next/server";
import { getEnvSummary } from "@/lib/env-validation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { nodeAuthEnvPresence } from "@/lib/render-node-auth";

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

  // ve_runs queue depth + oldest-pending age — early warning for pipeline
  // backlog AND for "queue not draining" (covered by SCALE-READINESS-AUDIT
  // §3.F, finished in the 2026-05-27 audit).
  const queueStart = Date.now();
  let queueDepth = 0;
  let queueOldestAgeSec: number | null = null;
  try {
    const [countResult, oldestResult] = await Promise.all([
      supabaseAdmin
        .from('ve_runs')
        .select('id', { count: 'exact', head: true })
        .in('status', ['created', 'transcribing', 'analyzing', 'assembling', 'rendering']),
      supabaseAdmin
        .from('ve_runs')
        .select('created_at')
        .in('status', ['created', 'transcribing', 'analyzing', 'assembling', 'rendering'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    queueDepth = countResult.count ?? 0;
    if (oldestResult.data?.created_at) {
      queueOldestAgeSec = Math.max(0, Math.floor((Date.now() - Date.parse(oldestResult.data.created_at)) / 1000));
    }

    // Two-axis health:
    //   depth >200       → red (pipeline backlog, losing the race)
    //   depth >50        → yellow (busy but OK)
    //   oldest > 30 min  → red (queue is stuck — worker likely offline)
    //   oldest > 5 min   → yellow (advancement is slow)
    let qStatus: 'pass' | 'fail' = 'pass';
    let qMsg: string | undefined;
    if (queueDepth > 200) {
      qStatus = 'fail';
      qMsg = `Queue depth ${queueDepth} — pipeline backlog`;
    } else if (queueOldestAgeSec !== null && queueOldestAgeSec > 1800) {
      qStatus = 'fail';
      qMsg = `Oldest pending ${Math.floor(queueOldestAgeSec / 60)}m — worker likely offline`;
    } else if (queueDepth > 50) {
      qMsg = `Queue depth ${queueDepth} — busy but OK`;
    } else if (queueOldestAgeSec !== null && queueOldestAgeSec > 300) {
      qMsg = `Oldest pending ${Math.floor(queueOldestAgeSec / 60)}m — advancement slow`;
    }
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

  // 2026-05-31: render-node auth env presence check. Vercel silently dropped
  // both RENDER_NODE_SECRET and RENDER_NODE_SECRET_PUBLIC out of our runtime,
  // which broke worker auth invisibly for days. This check fires loud if all
  // three accepted env vars are missing, so the next time it happens we see
  // "render_node_auth: fail" in /api/health within seconds.
  const nodeAuth = nodeAuthEnvPresence();
  checks.push({
    name: 'render_node_auth',
    status: nodeAuth.anyPresent ? 'pass' : 'fail',
    message: nodeAuth.anyPresent
      ? `Accepting: ${[
          nodeAuth.RENDER_NODE_SECRET && 'RENDER_NODE_SECRET',
          nodeAuth.RENDER_NODE_SECRET_PUBLIC && 'RENDER_NODE_SECRET_PUBLIC',
          nodeAuth.CRON_SECRET && 'CRON_SECRET',
        ].filter(Boolean).join(', ')}`
      : 'No render-node auth env vars present — worker cannot authenticate',
  });

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
    // Top-level metrics for external monitoring scrapers — easier to alarm on
    // than digging into the checks array.
    metrics: {
      queue_depth: queueDepth,
      queue_oldest_pending_age_sec: queueOldestAgeSec,
    },
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
