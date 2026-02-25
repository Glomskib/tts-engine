import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  createApiErrorResponse,
  generateCorrelationId,
} from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getJobHealthSummary } from "@/lib/ops/jobHealth";
import { MP_PLAN_CONFIGS, type MpPlanTier } from "@/lib/marketplace/plan-config";
import { opsLog } from "@/lib/ops/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

const log = opsLog("ops-health");

// ── Types ──────────────────────────────────────────────────

type CheckStatus = "healthy" | "degraded" | "unhealthy" | "not_configured";

interface CheckResult {
  name: string;
  status: CheckStatus;
  latency_ms?: number;
  message?: string;
  details?: Record<string, unknown>;
}

// ── Route ──────────────────────────────────────────────────

export async function GET(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId,
    );
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse(
      "FORBIDDEN",
      "Admin access required",
      403,
      correlationId,
    );
  }

  const startTime = Date.now();

  const [dbCheck, queueCheck, jobHealth, stripeCheck] = await Promise.all([
    checkDbLatency(),
    checkQueueSize(),
    checkStalledJobs(),
    checkStripeConfig(),
  ]);

  const checks = [dbCheck, queueCheck, jobHealth, stripeCheck];

  const hasUnhealthy = checks.some((c) => c.status === "unhealthy");
  const hasDegraded = checks.some((c) => c.status === "degraded");

  const overall: CheckStatus = hasUnhealthy
    ? "unhealthy"
    : hasDegraded
      ? "degraded"
      : "healthy";

  log.info("Health check complete", { overall, latency_ms: Date.now() - startTime });

  return NextResponse.json({
    ok: true,
    status: overall,
    checks,
    total_latency_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    correlation_id: correlationId,
  });
}

// ── Checks ─────────────────────────────────────────────────

async function checkDbLatency(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const { error } = await supabaseAdmin
      .from("edit_jobs")
      .select("id", { count: "exact", head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(5000));

    const latency = Date.now() - start;

    if (error) {
      return {
        name: "db_latency",
        status: "unhealthy",
        latency_ms: latency,
        message: error.message,
      };
    }

    // >2s is degraded, >5s is unhealthy
    const status: CheckStatus =
      latency > 5000 ? "unhealthy" : latency > 2000 ? "degraded" : "healthy";

    return { name: "db_latency", status, latency_ms: latency };
  } catch (err) {
    return {
      name: "db_latency",
      status: "unhealthy",
      latency_ms: Date.now() - start,
      message: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

async function checkQueueSize(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const { count, error } = await supabaseAdmin
      .from("edit_jobs")
      .select("id", { count: "exact", head: true })
      .eq("job_status", "queued");

    if (error) {
      return {
        name: "queue_size",
        status: "degraded",
        latency_ms: Date.now() - start,
        message: error.message,
      };
    }

    const depth = count ?? 0;
    // >50 queued = degraded, >100 = unhealthy
    const status: CheckStatus =
      depth > 100 ? "unhealthy" : depth > 50 ? "degraded" : "healthy";

    return {
      name: "queue_size",
      status,
      latency_ms: Date.now() - start,
      details: { depth },
    };
  } catch (err) {
    return {
      name: "queue_size",
      status: "degraded",
      latency_ms: Date.now() - start,
      message: err instanceof Error ? err.message : "Query failed",
    };
  }
}

async function checkStalledJobs(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const summary = await getJobHealthSummary();
    const total = summary.stalled_jobs + summary.overdue_jobs;

    const status: CheckStatus =
      summary.overdue_jobs > 0
        ? "unhealthy"
        : summary.stalled_jobs > 0
          ? "degraded"
          : "healthy";

    return {
      name: "stalled_jobs",
      status,
      latency_ms: Date.now() - start,
      details: {
        stalled: summary.stalled_jobs,
        overdue: summary.overdue_jobs,
        total_flagged: total,
      },
    };
  } catch (err) {
    return {
      name: "stalled_jobs",
      status: "degraded",
      latency_ms: Date.now() - start,
      message: err instanceof Error ? err.message : "Check failed",
    };
  }
}

async function checkStripeConfig(): Promise<CheckResult> {
  const tiers = Object.entries(MP_PLAN_CONFIGS) as [MpPlanTier, (typeof MP_PLAN_CONFIGS)[MpPlanTier]][];
  const missing: string[] = [];
  const configured: string[] = [];

  for (const [tier, cfg] of tiers) {
    if (tier === "custom") continue; // custom has no Stripe price
    if (cfg.stripe_price_id) {
      configured.push(tier);
    } else {
      missing.push(tier);
    }
  }

  const hasSecret = !!process.env.STRIPE_SECRET_KEY;
  const hasWebhook = !!process.env.STRIPE_WEBHOOK_SECRET;

  if (!hasSecret) {
    return {
      name: "stripe_config",
      status: "unhealthy",
      message: "STRIPE_SECRET_KEY not set",
    };
  }

  const status: CheckStatus =
    missing.length > 0 || !hasWebhook ? "degraded" : "healthy";

  return {
    name: "stripe_config",
    status,
    details: {
      secret_key: hasSecret,
      webhook_secret: hasWebhook,
      tiers_configured: configured,
      tiers_missing: missing.length > 0 ? missing : undefined,
    },
  };
}
