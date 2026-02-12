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
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { computeQueueHealth } from "@/lib/ops-metrics";
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
    const result = await computeQueueHealth(supabaseAdmin);

    if (!result.ok) {
      return createApiErrorResponse("DB_ERROR", result.error || "Failed to compute queue health", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: result.data,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/observability/queue-health error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
