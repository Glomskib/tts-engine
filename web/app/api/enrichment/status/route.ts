/**
 * GET /api/enrichment/status
 *
 * Get enrichment pipeline status and health metrics.
 *
 * Response:
 * {
 *   ok: boolean
 *   data: {
 *     counts: {
 *       pending: number
 *       succeeded: number
 *       failed: number
 *       retrying: number
 *       total: number
 *     }
 *     recent_failures: Array<{
 *       id: string
 *       external_id: string
 *       last_error: string
 *       attempt_count: number
 *       last_attempt_at: string
 *     }>
 *     success_rate_24h: number
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { getEnrichmentStatus } from "@/lib/enrichment";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required for enrichment status", 403, correlationId);
  }

  try {
    const result = await getEnrichmentStatus(supabaseAdmin);

    if (!result.ok) {
      return createApiErrorResponse("DB_ERROR", result.error || "Failed to get enrichment status", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        generated_at: new Date().toISOString(),
        counts: result.counts,
        recent_failures: result.recent_failures,
        success_rate_24h: result.success_rate_24h,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/enrichment/status error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
