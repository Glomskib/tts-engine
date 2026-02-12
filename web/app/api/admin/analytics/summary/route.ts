import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import {
  computeStageStats,
  computeThroughputByDay,
  computeProductivity,
} from "@/lib/analytics";
import { getEffectiveNumber } from "@/lib/settings";

export const runtime = "nodejs";

const VALID_WINDOWS = [7, 14, 30];

/**
 * GET /api/admin/analytics/summary
 * Admin-only endpoint to get analytics summary.
 * Query params: window=7|14|30 (default 7)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Admin-only
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  // Parse window parameter - use setting as default
  const url = new URL(request.url);
  const windowParam = url.searchParams.get("window");
  let windowDays = 7; // hardcoded fallback

  if (windowParam) {
    const parsed = parseInt(windowParam, 10);
    if (VALID_WINDOWS.includes(parsed)) {
      windowDays = parsed;
    }
  } else {
    // Use system setting for default window
    try {
      const settingValue = await getEffectiveNumber("ANALYTICS_DEFAULT_WINDOW_DAYS");
      if (VALID_WINDOWS.includes(settingValue)) {
        windowDays = settingValue;
      }
    } catch {
      // Use hardcoded fallback on error
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
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
