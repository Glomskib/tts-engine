/**
 * POST /api/ingestion/tiktok
 *
 * Ingest videos from TikTok URLs.
 * Supports two modes:
 * - validate_only: Parse and validate, return job without committing
 * - commit: Validate and commit in one call (if all valid)
 *
 * Request body:
 * {
 *   urls: string[]         // List of TikTok URLs to ingest
 *   validate_only?: boolean // If true, only validate (default: false)
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
  normalizeTikTokUrls,
} from "@/lib/ingestion";

export const runtime = "nodejs";

const MAX_URLS_PER_REQUEST = 500;

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
  let body: { urls?: unknown; validate_only?: boolean };
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  // Validate urls
  if (!body.urls || !Array.isArray(body.urls)) {
    const err = apiError("BAD_REQUEST", "urls must be an array of strings", 400);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  const urls = body.urls.filter((u): u is string => typeof u === "string");
  if (urls.length === 0) {
    const err = apiError("BAD_REQUEST", "urls array is empty", 400);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  if (urls.length > MAX_URLS_PER_REQUEST) {
    const err = apiError(
      "BAD_REQUEST",
      `Maximum ${MAX_URLS_PER_REQUEST} URLs per request`,
      400
    );
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  const validateOnly = body.validate_only === true;

  try {
    // Step 1: Normalize URLs
    const normalizedRows = normalizeTikTokUrls(urls);

    // Step 2: Create job
    const createResult = await createIngestionJob(supabaseAdmin, {
      source: "tiktok_url",
      source_ref: `${urls.length} TikTok URLs`,
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
    console.error("POST /api/ingestion/tiktok error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json(
      { ...error.body, correlation_id: correlationId },
      { status: error.status }
    );
  }
}
