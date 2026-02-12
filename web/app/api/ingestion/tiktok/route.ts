/**
 * POST /api/ingestion/tiktok
 *
 * Ingest videos from TikTok URLs.
 * Supports two modes:
 * - validate_only: Parse and validate, return job without committing
 * - commit: Validate and commit in one call (if all valid)
 *
 * Supports chunked uploads:
 * - First request: omit job_id to create a new job
 * - Subsequent requests: include job_id to append URLs to existing job
 *
 * Request body:
 * {
 *   urls: string[]          // List of TikTok URLs to ingest
 *   job_id?: string         // Existing job ID for chunked append
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
 *     max_urls_per_chunk: number  // For client chunking
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  createIngestionJob,
  appendRowsToJob,
  validateIngestionJob,
  commitIngestionJob,
  normalizeTikTokUrls,
} from "@/lib/ingestion";

export const runtime = "nodejs";

const MAX_URLS_PER_CHUNK = 250;

export async function POST(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required for ingestion", 403, correlationId);
  }

  const actor = authContext.user?.id || "admin";

  // Parse body
  let body: { urls?: unknown; job_id?: string; validate_only?: boolean };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  // Validate urls
  if (!body.urls || !Array.isArray(body.urls)) {
    return createApiErrorResponse("BAD_REQUEST", "urls must be an array of strings", 400, correlationId);
  }

  const urls = body.urls.filter((u): u is string => typeof u === "string");
  if (urls.length === 0) {
    return createApiErrorResponse("BAD_REQUEST", "urls array is empty", 400, correlationId);
  }

  if (urls.length > MAX_URLS_PER_CHUNK) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      `Maximum ${MAX_URLS_PER_CHUNK} URLs per request. Use chunked upload for larger datasets.`,
      400,
      correlationId,
      { max_urls_per_chunk: MAX_URLS_PER_CHUNK }
    );
  }

  const validateOnly = body.validate_only === true;
  const existingJobId = body.job_id;

  try {
    // Step 1: Normalize URLs
    const normalizedRows = normalizeTikTokUrls(urls);

    let jobId: string;
    let totalRows: number;

    // Step 2: Create or append to job
    if (existingJobId) {
      // Append to existing job (chunked upload)
      const appendResult = await appendRowsToJob(supabaseAdmin, {
        job_id: existingJobId,
        rows: normalizedRows,
        actor,
      });

      if (!appendResult.ok || !appendResult.job) {
        return createApiErrorResponse("DB_ERROR", appendResult.error || "Failed to append URLs", 500, correlationId);
      }

      jobId = existingJobId;
      totalRows = appendResult.job.total_rows;
    } else {
      // Create new job
      const createResult = await createIngestionJob(supabaseAdmin, {
        source: "tiktok_url",
        source_ref: `${urls.length} TikTok URLs`,
        rows: normalizedRows,
        actor,
      });

      if (!createResult.ok || !createResult.job) {
        return createApiErrorResponse("DB_ERROR", createResult.error || "Failed to create job", 500, correlationId);
      }

      jobId = createResult.job.id;
      totalRows = createResult.job.total_rows;
    }

    // Step 3: Validate job
    const validateResult = await validateIngestionJob(supabaseAdmin, {
      job_id: jobId,
      actor,
    });

    if (!validateResult.ok) {
      return createApiErrorResponse("DB_ERROR", validateResult.error || "Failed to validate job", 500, correlationId);
    }

    // If validate_only, return now
    if (validateOnly) {
      return NextResponse.json({
        ok: true,
        data: {
          job_id: jobId,
          status: validateResult.job?.status,
          total_rows: totalRows,
          validated_count: validateResult.validated_count,
          failed_count: validateResult.failed_count,
          duplicate_count: validateResult.duplicate_count,
          errors: validateResult.errors,
          max_urls_per_chunk: MAX_URLS_PER_CHUNK,
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
          total_rows: totalRows,
          validated_count: 0,
          failed_count: validateResult.failed_count,
          duplicate_count: validateResult.duplicate_count,
          committed_count: 0,
          created_video_ids: [],
          errors: validateResult.errors,
          max_urls_per_chunk: MAX_URLS_PER_CHUNK,
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
        total_rows: totalRows,
        validated_count: validateResult.validated_count,
        failed_count: validateResult.failed_count + commitResult.failed_count,
        duplicate_count: validateResult.duplicate_count,
        committed_count: commitResult.committed_count,
        created_video_ids: commitResult.created_video_ids,
        errors: validateResult.errors,
        max_urls_per_chunk: MAX_URLS_PER_CHUNK,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/ingestion/tiktok error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
