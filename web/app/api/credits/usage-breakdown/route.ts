import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { getUsageBreakdown } from "@/lib/credits";

export const runtime = "nodejs";

/**
 * GET /api/credits/usage-breakdown
 *
 * Returns credit spend aggregated by action type for the current billing period.
 * Query params:
 *   start - ISO date (defaults to 30 days ago)
 *   end   - ISO date (defaults to now)
 */
export async function GET(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId,
    );
  }

  try {
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const start = searchParams.get("start") || thirtyDaysAgo.toISOString();
    const end = searchParams.get("end") || now.toISOString();

    const breakdown = await getUsageBreakdown(
      authContext.user.id,
      start,
      end,
    );

    return NextResponse.json({
      ok: true,
      breakdown,
      period: { start, end },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Usage breakdown error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      "Failed to fetch usage breakdown",
      500,
      correlationId,
    );
  }
}
