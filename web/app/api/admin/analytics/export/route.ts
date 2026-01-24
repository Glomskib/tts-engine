import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import {
  computeStageStats,
  computeThroughputByDay,
  computeProductivity,
  generateStageStatsCsv,
  generateThroughputCsv,
  generateProductivityCsv,
} from "@/lib/analytics";

export const runtime = "nodejs";

const VALID_WINDOWS = [7, 14, 30];
const DEFAULT_WINDOW = 7;
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

  // Parse parameters
  const url = new URL(request.url);
  const windowParam = url.searchParams.get("window");
  const typeParam = url.searchParams.get("type");

  let windowDays = DEFAULT_WINDOW;
  if (windowParam) {
    const parsed = parseInt(windowParam, 10);
    if (VALID_WINDOWS.includes(parsed)) {
      windowDays = parsed;
    }
  }

  // Validate type
  if (!typeParam || !VALID_TYPES.includes(typeParam)) {
    const err = apiError("BAD_REQUEST", `type parameter required. Valid types: ${VALID_TYPES.join(", ")}`, 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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
        const err = apiError("BAD_REQUEST", `Invalid type: ${typeParam}`, 400);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
