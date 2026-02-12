/**
 * GET /api/ingestion/jobs
 *
 * List ingestion jobs with optional filters.
 *
 * Query parameters:
 * - source: Filter by source type (tiktok_url, csv, sheets, monday, manual)
 * - status: Filter by status (pending, validated, committed, failed, partial)
 * - limit: Max results (default: 50, max: 200)
 * - offset: Pagination offset (default: 0)
 *
 * Response:
 * {
 *   ok: boolean
 *   data: {
 *     jobs: IngestionJob[]
 *     total: number
 *     limit: number
 *     offset: number
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  listIngestionJobs,
  INGESTION_SOURCES,
  JOB_STATUSES,
  type IngestionSource,
  type JobStatus,
} from "@/lib/ingestion";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required for ingestion", 403, correlationId);
  }

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);

    const sourceParam = searchParams.get("source");
    const statusParam = searchParams.get("status");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    // Validate source
    let source: IngestionSource | undefined;
    if (sourceParam) {
      if (!INGESTION_SOURCES.includes(sourceParam as IngestionSource)) {
        return createApiErrorResponse(
          "BAD_REQUEST",
          `Invalid source. Must be one of: ${INGESTION_SOURCES.join(", ")}`,
          400,
          correlationId
        );
      }
      source = sourceParam as IngestionSource;
    }

    // Validate status
    let status: JobStatus | undefined;
    if (statusParam) {
      if (!JOB_STATUSES.includes(statusParam as JobStatus)) {
        return createApiErrorResponse(
          "BAD_REQUEST",
          `Invalid status. Must be one of: ${JOB_STATUSES.join(", ")}`,
          400,
          correlationId
        );
      }
      status = statusParam as JobStatus;
    }

    // Parse pagination
    const limit = Math.min(Math.max(parseInt(limitParam || "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(offsetParam || "0", 10) || 0, 0);

    // Fetch jobs
    const result = await listIngestionJobs(supabaseAdmin, {
      source,
      status,
      limit,
      offset,
    });

    if (!result.ok) {
      return createApiErrorResponse("DB_ERROR", result.error || "Failed to fetch jobs", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        jobs: result.jobs,
        total: result.total,
        limit,
        offset,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/ingestion/jobs error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
