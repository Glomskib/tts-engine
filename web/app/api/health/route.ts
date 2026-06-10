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

  // HeyGen API credit balance check — 2026-06-09. Every avatar video render
  // consumes HeyGen API credits. If the balance hits zero, the entire Quick
  // Video pipeline silently fails for every user with a clear-but-too-late
  // 'Insufficient credit. This operation requires "api" credits.' error.
  //
  // We check the balance and alarm if low so Brandon sees "HeyGen balance
  // low" on /api/health BEFORE customers see a failure on /studio/oneprompt.
  //
  // HeyGen credits API: GET /v2/user/remaining_quota
  //   { error: null, data: { remaining_quota: number /* in 1/1000 credits */ } }
  // 1 quota unit = ~1 second of video. ~$0.30 per minute = ~$0.005/sec.
  // Alert thresholds: <300 (~5min video left) = fail, <1500 (~25min) = warn.
  if (process.env.HEYGEN_API_KEY) {
    const heygenStart = Date.now();
    try {
      const r = await fetch('https://api.heygen.com/v2/user/remaining_quota', {
        method: 'GET',
        headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) {
        checks.push({
          name: 'heygen_balance',
          status: 'fail',
          message: `HeyGen API returned ${r.status} — credit balance unknown, render pipeline at risk`,
          responseTime: Date.now() - heygenStart,
        });
      } else {
        const body = await r.json().catch(() => ({}));
        const remaining = body?.data?.remaining_quota ?? body?.remaining_quota ?? null;
        if (typeof remaining !== 'number') {
          checks.push({
            name: 'heygen_balance',
            status: 'fail',
            message: 'HeyGen API responded but balance field missing — schema may have changed',
            responseTime: Date.now() - heygenStart,
          });
        } else {
          // Estimate remaining video minutes for the message. HeyGen's
          // remaining_quota field is in credit units; the conversion to
          // seconds depends on plan, but ~60 credits = ~1 min is typical.
          const estMinutes = Math.floor(remaining / 60);
          let hgStatus: 'pass' | 'fail' = 'pass';
          let hgMsg: string | undefined = `HeyGen balance: ${remaining} credits (~${estMinutes} min of video)`;
          if (remaining < 300) {
            hgStatus = 'fail';
            hgMsg = `HeyGen balance LOW: ${remaining} credits (~${estMinutes} min). Top up at app.heygen.com/settings/subscription before customers hit a failure.`;
          } else if (remaining < 1500) {
            hgMsg = `HeyGen balance warning: ${remaining} credits (~${estMinutes} min). Top up soon at app.heygen.com/settings/subscription.`;
          }
          checks.push({
            name: 'heygen_balance',
            status: hgStatus,
            message: hgMsg,
            responseTime: Date.now() - heygenStart,
          });
        }
      }
    } catch (err) {
      checks.push({
        name: 'heygen_balance',
        status: 'fail',
        message: err instanceof Error
          ? `HeyGen balance check failed: ${err.message}`
          : 'HeyGen balance check failed',
        responseTime: Date.now() - heygenStart,
      });
    }
  }

  // Queue depth + oldest-pending age. 2026-05-31: now checks BOTH queue
  // systems (ve_runs + render_jobs). Before, this only checked ve_runs and
  // reported "worker offline" while the mini was actively processing
  // render_jobs — confusing users on /create who saw conflicting banners.
  // We treat each queue separately so we can tell which subsystem is slow.
  // Stale jobs (>7d old) are excluded as "abandoned" so historical mess
  // doesn't pollute the live health signal.
  const queueStart = Date.now();
  const STALE_CUTOFF = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let queueDepth = 0;
  let queueOldestAgeSec: number | null = null;
  let renderQueueDepth = 0;
  let renderQueueOldestAgeSec: number | null = null;
  try {
    const [veCount, veOldest, rjCount, rjOldest] = await Promise.all([
      supabaseAdmin
        .from('ve_runs')
        .select('id', { count: 'exact', head: true })
        .in('status', ['created', 'transcribing', 'analyzing', 'assembling', 'rendering'])
        .gte('created_at', STALE_CUTOFF),
      supabaseAdmin
        .from('ve_runs')
        .select('created_at')
        .in('status', ['created', 'transcribing', 'analyzing', 'assembling', 'rendering'])
        .gte('created_at', STALE_CUTOFF)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('render_jobs')
        .select('id', { count: 'exact', head: true })
        .in('status', ['queued', 'claimed', 'processing'])
        .gte('created_at', STALE_CUTOFF),
      supabaseAdmin
        .from('render_jobs')
        .select('created_at')
        .in('status', ['queued', 'claimed', 'processing'])
        .gte('created_at', STALE_CUTOFF)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    queueDepth = veCount.count ?? 0;
    if (veOldest.data?.created_at) {
      queueOldestAgeSec = Math.max(0, Math.floor((Date.now() - Date.parse(veOldest.data.created_at)) / 1000));
    }
    renderQueueDepth = rjCount.count ?? 0;
    if (rjOldest.data?.created_at) {
      renderQueueOldestAgeSec = Math.max(0, Math.floor((Date.now() - Date.parse(rjOldest.data.created_at)) / 1000));
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

    // Second check: render_jobs queue (mac mini worker)
    let rjStatus: 'pass' | 'fail' = 'pass';
    let rjMsg: string | undefined;
    if (renderQueueDepth > 100) {
      rjStatus = 'fail';
      rjMsg = `Render queue depth ${renderQueueDepth} — mini falling behind`;
    } else if (renderQueueOldestAgeSec !== null && renderQueueOldestAgeSec > 1800) {
      rjStatus = 'fail';
      rjMsg = `Render queue oldest ${Math.floor(renderQueueOldestAgeSec / 60)}m — mini worker likely offline`;
    } else if (renderQueueDepth > 0) {
      rjMsg = `Render queue: ${renderQueueDepth} active`;
    }
    checks.push({
      name: 'render_jobs_queue',
      status: rjStatus,
      message: rjMsg,
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
      // ve_runs queue (legacy pipeline)
      queue_depth: queueDepth,
      // render_jobs queue (mac mini)
      render_queue_depth: renderQueueDepth,
      render_queue_oldest_pending_age_sec: renderQueueOldestAgeSec,
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
