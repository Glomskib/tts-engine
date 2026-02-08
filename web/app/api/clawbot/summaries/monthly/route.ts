import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";
import {
  enforceRateLimits,
  extractRateLimitContext,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeSummary } from "@/lib/clawbot/summaries";

export const runtime = "nodejs";

/**
 * POST /api/clawbot/summaries/monthly
 * Generate monthly pattern summary from feedback data (rolling 30 days)
 */
export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  // Auth — admin only
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  // Rate limit
  const rlContext = {
    ...extractRateLimitContext(request),
    userId: authContext.user.id,
  };
  const rateLimited = enforceRateLimits(rlContext, correlationId, { userLimit: 3 });
  if (rateLimited) return rateLimited;

  const userId = authContext.user.id;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const summary = await computeSummary(userId, thirtyDaysAgo, now);

    // Upsert to clawbot_summaries
    const periodStart = thirtyDaysAgo.toISOString().slice(0, 10);
    const periodEnd = now.toISOString().slice(0, 10);

    const { error: upsertError } = await supabaseAdmin
      .from("clawbot_summaries")
      .upsert(
        {
          user_id: userId,
          period_start: periodStart,
          period_end: periodEnd,
          summary_type: "monthly",
          summary,
        },
        { onConflict: "user_id,summary_type,period_start,period_end" }
      );

    if (upsertError) {
      console.error(`[${correlationId}] Failed to upsert monthly summary:`, upsertError.message);
    }

    const response = NextResponse.json(
      {
        ok: true,
        summary,
        correlation_id: correlationId,
      },
      { status: 201 }
    );
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (err) {
    console.error(`[${correlationId}] Monthly summary error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to generate monthly summary",
      500,
      correlationId
    );
  }
}

/**
 * GET /api/clawbot/summaries/monthly
 * Alias for /api/clawbot/summaries/monthly/latest
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  const { data: row, error } = await supabaseAdmin
    .from("clawbot_summaries")
    .select("id, summary, period_start, period_end, created_at")
    .eq("user_id", authContext.user.id)
    .eq("summary_type", "monthly")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[${correlationId}] Failed to fetch monthly summary:`, error.message);
    return createApiErrorResponse("DB_ERROR", "Failed to fetch summary", 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    summary: row?.summary ?? null,
    period: row ? { start: row.period_start, end: row.period_end } : null,
    created_at: row?.created_at ?? null,
    correlation_id: correlationId,
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}
