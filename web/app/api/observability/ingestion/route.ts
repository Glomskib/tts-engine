/**
 * GET /api/observability/ingestion
 *
 * Returns ingestion health metrics including:
 * - Total jobs by status
 * - Jobs by source
 * - Recent failures
 * - 24h activity summary
 *
 * This endpoint is designed for monitoring dashboards.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getIngestionMetrics } from "@/lib/ingestion";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    const result = await getIngestionMetrics(supabaseAdmin);

    if (!result.ok) {
      const err = apiError(
        "DB_ERROR",
        result.error || "Failed to compute ingestion metrics",
        500
      );
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        generated_at: new Date().toISOString(),
        ...result.metrics,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/observability/ingestion error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json(
      { ...error.body, correlation_id: correlationId },
      { status: error.status }
    );
  }
}
