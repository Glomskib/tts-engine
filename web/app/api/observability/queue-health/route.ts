/**
 * GET /api/observability/queue-health
 *
 * Returns real-time queue health metrics including:
 * - Videos in each queue status (claimed vs unclaimed)
 * - Claims expiring soon
 * - Overall queue totals
 *
 * This endpoint is designed for monitoring dashboards and alerting systems.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { computeQueueHealth } from "@/lib/ops-metrics";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    const result = await computeQueueHealth(supabaseAdmin);

    if (!result.ok) {
      const err = apiError("DB_ERROR", result.error || "Failed to compute queue health", 500);
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    return NextResponse.json({
      ok: true,
      data: result.data,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/observability/queue-health error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json(
      { ...error.body, correlation_id: correlationId },
      { status: error.status }
    );
  }
}
