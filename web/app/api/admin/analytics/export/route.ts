import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import {
  computeStageStats,
  computeThroughputByDay,
  computeProductivity,
  generateStageStatsCsv,
  generateThroughputCsv,
  generateProductivityCsv,
} from "@/lib/analytics";
import { getEffectiveNumber } from "@/lib/settings";

export const runtime = "nodejs";

const VALID_WINDOWS = [7, 14, 30];
const VALID_TYPES = ["stage", "throughput", "productivity"];

/**
 * GET /api/admin/analytics/export
 * Admin-only endpoint to export analytics as CSV.
 * Query params:
 *   window=7|14|30 (default 7)
 *   type=stage|throughput|productivity (required)
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

  // Parse parameters
  const url = new URL(request.url);
  const windowParam = url.searchParams.get("window");
  const typeParam = url.searchParams.get("type");

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

  // Validate type
  if (!typeParam || !VALID_TYPES.includes(typeParam)) {
    return createApiErrorResponse("BAD_REQUEST", `type parameter required. Valid types: ${VALID_TYPES.join(", ")}`, 400, correlationId);
  }

  try {
    let csvContent: string;
    let filename: string;

    switch (typeParam) {
      case "stage":
        const stageStats = await computeStageStats(windowDays);
        csvContent = generateStageStatsCsv(stageStats);
        filename = `analytics_stage_stats_${windowDays}d_${new Date().toISOString().split("T")[0]}.csv`;
        break;

      case "throughput":
        const throughput = await computeThroughputByDay(windowDays);
        csvContent = generateThroughputCsv(throughput);
        filename = `analytics_throughput_${windowDays}d_${new Date().toISOString().split("T")[0]}.csv`;
        break;

      case "productivity":
        const productivity = await computeProductivity(windowDays);
        csvContent = generateProductivityCsv(productivity);
        filename = `analytics_productivity_${windowDays}d_${new Date().toISOString().split("T")[0]}.csv`;
        break;

      default:
        return createApiErrorResponse("BAD_REQUEST", `Invalid type: ${typeParam}`, 400, correlationId);
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Correlation-Id": correlationId,
      },
    });
  } catch (err) {
    console.error("GET /api/admin/analytics/export error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
