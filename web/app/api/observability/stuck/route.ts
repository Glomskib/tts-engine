/**
 * GET /api/observability/stuck
 *
 * Returns videos that are "stuck" - in queue statuses for longer than
 * the configured threshold (default 24 hours).
 *
 * Query parameters:
 * - limit: Maximum number of stuck videos to return (default: 100)
 *
 * This endpoint is designed for monitoring dashboards and alerting systems.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { computeStuckVideos } from "@/lib/ops-metrics";
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
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 100;

    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return createApiErrorResponse("BAD_REQUEST", "limit must be between 1 and 1000", 400, correlationId);
    }

    const result = await computeStuckVideos(supabaseAdmin, { limit });

    if (!result.ok) {
      return createApiErrorResponse("DB_ERROR", result.error || "Failed to compute stuck videos", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: result.data,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/observability/stuck error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
