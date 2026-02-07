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
 * POST /api/clawbot/summaries/weekly
 * Generate weekly pattern summary from feedback data
 */
export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  // Auth — admin only
  const authContext = await getApiAuthContext();
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
  const rateLimited = enforceRateLimits(rlContext, correlationId, { userLimit: 5 });
  if (rateLimited) return rateLimited;

  const userId = authContext.user.id;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const summary = await computeSummary(userId, sevenDaysAgo, now);

    // Upsert to clawbot_summaries
    const periodStart = sevenDaysAgo.toISOString().slice(0, 10);
    const periodEnd = now.toISOString().slice(0, 10);

    const { error: upsertError } = await supabaseAdmin
      .from("clawbot_summaries")
      .upsert(
        {
          user_id: userId,
          period_start: periodStart,
          period_end: periodEnd,
          summary_type: "weekly",
          summary,
        },
        { onConflict: "user_id,summary_type,period_start,period_end" }
      );

    if (upsertError) {
      console.error(`[${correlationId}] Failed to upsert summary:`, upsertError.message);
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
    console.error(`[${correlationId}] Weekly summary error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to generate weekly summary",
      500,
      correlationId
    );
  }
}
