/**
 * POST /api/ingestion/csv
 *
 * Ingest videos from CSV data (parsed client-side).
 * Expects normalized row objects.
 *
 * Request body:
 * {
 *   source_ref: string,       // CSV filename or identifier
 *   rows: Array<{             // Parsed CSV rows
 *     external_id?: string,
 *     caption?: string,
 *     hashtags?: string | string[],
 *     product_sku?: string,
 *     product_link?: string,
 *     script_text?: string,
 *     target_account?: string,
 *     variant_id?: string,
 *     account_id?: string,
 *   }>,
 *   validate_only?: boolean   // If true, only validate (default: false)
 * }
 *
 * Response:
 * {
 *   ok: boolean
 *   data: {
 *     job_id: string
 *     status: string
 *     total_rows: number
 *     validated_count: number
 *     failed_count: number
 *     duplicate_count: number
 *     committed_count?: number
 *     created_video_ids?: string[]
 *     errors?: ErrorSummaryEntry[]
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  createIngestionJob,
  validateIngestionJob,
  commitIngestionJob,
  normalizeCsvRows,
} from "@/lib/ingestion";

export const runtime = "nodejs";

const MAX_ROWS_PER_REQUEST = 1000;

export async function POST(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only check
  const authContext = await getApiAuthContext();
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required for ingestion", 403);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  const actor = authContext.user?.id || "admin";

  // Parse body
  let body: {
    source_ref?: string;
    rows?: unknown;
    validate_only?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  // Validate source_ref
  if (!body.source_ref || typeof body.source_ref !== "string") {
    const err = apiError("BAD_REQUEST", "source_ref is required", 400);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  // Validate rows
  if (!body.rows || !Array.isArray(body.rows)) {
    const err = apiError("BAD_REQUEST", "rows must be an array of objects", 400);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  const rows = body.rows.filter(
    (r): r is Record<string, unknown> => typeof r === "object" && r !== null
  );

  if (rows.length === 0) {
    const err = apiError("BAD_REQUEST", "rows array is empty", 400);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  if (rows.length > MAX_ROWS_PER_REQUEST) {
    const err = apiError(
      "BAD_REQUEST",
      `Maximum ${MAX_ROWS_PER_REQUEST} rows per request`,
      400
    );
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  const validateOnly = body.validate_only === true;

  try {
    // Step 1: Normalize rows
    const normalizedRows = normalizeCsvRows(rows);

    // Step 2: Create job
    const createResult = await createIngestionJob(supabaseAdmin, {
      source: "csv",
      source_ref: body.source_ref,
      rows: normalizedRows,
      actor,
    });

    if (!createResult.ok || !createResult.job) {
      const err = apiError("DB_ERROR", createResult.error || "Failed to create job", 500);
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    const jobId = createResult.job.id;

    // Step 3: Validate job
    const validateResult = await validateIngestionJob(supabaseAdmin, {
      job_id: jobId,
      actor,
    });

    if (!validateResult.ok) {
      const err = apiError("DB_ERROR", validateResult.error || "Failed to validate job", 500);
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    // If validate_only, return now
    if (validateOnly) {
      return NextResponse.json({
        ok: true,
        data: {
          job_id: jobId,
          status: validateResult.job?.status,
          total_rows: createResult.job.total_rows,
          validated_count: validateResult.validated_count,
          failed_count: validateResult.failed_count,
          duplicate_count: validateResult.duplicate_count,
          errors: validateResult.errors,
        },
        correlation_id: correlationId,
      });
    }

    // Step 4: Commit (if validation passed)
    if (validateResult.validated_count === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          job_id: jobId,
          status: "failed",
          total_rows: createResult.job.total_rows,
          validated_count: 0,
          failed_count: validateResult.failed_count,
          duplicate_count: validateResult.duplicate_count,
          committed_count: 0,
          created_video_ids: [],
          errors: validateResult.errors,
        },
        correlation_id: correlationId,
      });
    }

    const commitResult = await commitIngestionJob(supabaseAdmin, {
      job_id: jobId,
      actor,
      correlation_id: correlationId,
    });

    return NextResponse.json({
      ok: true,
      data: {
        job_id: jobId,
        status: commitResult.job?.status || "committed",
        total_rows: createResult.job.total_rows,
        validated_count: validateResult.validated_count,
        failed_count: validateResult.failed_count + commitResult.failed_count,
        duplicate_count: validateResult.duplicate_count,
        committed_count: commitResult.committed_count,
        created_video_ids: commitResult.created_video_ids,
        errors: validateResult.errors,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/ingestion/csv error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json(
      { ...error.body, correlation_id: correlationId },
      { status: error.status }
    );
  }
}
