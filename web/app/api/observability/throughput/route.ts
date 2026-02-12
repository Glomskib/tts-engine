/**
 * GET /api/observability/throughput
 *
 * Returns throughput metrics showing video status transitions over time.
 *
 * Query parameters:
 * - window_days: Number of days to include (default: 7, max: 90)
 *
 * This endpoint is designed for monitoring dashboards and capacity planning.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { computeThroughput } from "@/lib/ops-metrics";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const windowParam = searchParams.get("window_days");
    const windowDays = windowParam ? parseInt(windowParam, 10) : undefined;

    if (windowDays !== undefined && (isNaN(windowDays) || windowDays < 1 || windowDays > 90)) {
      return createApiErrorResponse("BAD_REQUEST", "window_days must be between 1 and 90", 400, correlationId);
    }

    const result = await computeThroughput(supabaseAdmin, { window_days: windowDays });

    if (!result.ok) {
      return createApiErrorResponse("DB_ERROR", result.error || "Failed to compute throughput", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: result.data,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/observability/throughput error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
