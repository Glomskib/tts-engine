/**
 * GET /api/observability/health
 *
 * Returns a combined health check result for monitoring systems.
 * Checks:
 * - Unclaimed backlog size
 * - Expiring claims
 * - Stuck videos
 *
 * Returns:
 * - HTTP 200 with healthy: true if all checks pass
 * - HTTP 200 with healthy: false if any check has warnings/critical issues
 *
 * This endpoint is designed for uptime monitoring and alerting integrations.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { performHealthCheck } from "@/lib/ops-metrics";
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
    const result = await performHealthCheck(supabaseAdmin);

    if (!result.ok) {
      return createApiErrorResponse("DB_ERROR", result.error || "Failed to perform health check", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: result.data,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/observability/health error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
