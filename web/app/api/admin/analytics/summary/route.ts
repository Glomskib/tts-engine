import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import {
  computeStageStats,
  computeThroughputByDay,
  computeProductivity,
} from "@/lib/analytics";

export const runtime = "nodejs";

const VALID_WINDOWS = [7, 14, 30];
const DEFAULT_WINDOW = 7;

/**
 * GET /api/admin/analytics/summary
 * Admin-only endpoint to get analytics summary.
 * Query params: window=7|14|30 (default 7)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Admin-only
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Parse window parameter
  const url = new URL(request.url);
  const windowParam = url.searchParams.get("window");
  let windowDays = DEFAULT_WINDOW;

  if (windowParam) {
    const parsed = parseInt(windowParam, 10);
    if (VALID_WINDOWS.includes(parsed)) {
      windowDays = parsed;
    }
  }

  try {
    // Compute all analytics in parallel
    const [stageStats, throughputByDay, productivity] = await Promise.all([
      computeStageStats(windowDays),
      computeThroughputByDay(windowDays),
      computeProductivity(windowDays),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        window_days: windowDays,
        computed_at: new Date().toISOString(),
        stage_stats: stageStats,
        throughput_by_day: throughputByDay,
        productivity,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/admin/analytics/summary error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
