/**
 * POST /api/enrichment/run
 *
 * Manually trigger enrichment processing.
 * Claims up to N pending tasks and processes them sequentially.
 *
 * Query parameters:
 * - limit: Maximum tasks to process (default: 10, max: 50)
 *
 * Response:
 * {
 *   ok: boolean
 *   data: {
 *     processed: number
 *     succeeded: number
 *     failed: number
 *     scheduled_retry: number
 *     results: EnrichmentResult[]
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { runEnrichment } from "@/lib/enrichment";

export const runtime = "nodejs";

// Allow longer execution for batch processing
export const maxDuration = 60;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function POST(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only check
  const authContext = await getApiAuthContext();
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required for enrichment", 403);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  try {
    // Parse limit from query params
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = Math.min(
      Math.max(parseInt(limitParam || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    // Run enrichment
    const result = await runEnrichment(supabaseAdmin, limit);

    if (!result.ok) {
      const err = apiError("DB_ERROR", result.error || "Failed to run enrichment", 500);
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        scheduled_retry: result.retrying,
        results: result.results,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/enrichment/run error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json(
      { ...error.body, correlation_id: correlationId },
      { status: error.status }
    );
  }
}
