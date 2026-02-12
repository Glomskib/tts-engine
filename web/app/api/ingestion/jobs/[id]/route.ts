/**
 * GET /api/ingestion/jobs/[id]
 *
 * Get detailed information about an ingestion job, including row-level status.
 *
 * Query parameters:
 * - include_rows: boolean (default: true) - Include row details
 * - row_status: Filter rows by status (pending, validated, committed, failed, duplicate)
 * - limit: Max rows (default: 100)
 * - offset: Row pagination offset (default: 0)
 * - report: boolean (default: false) - Return reconciliation report format
 *
 * Response:
 * {
 *   ok: boolean
 *   data: {
 *     job: IngestionJob
 *     rows?: IngestionRow[]
 *     rows_total?: number
 *     report?: ReconciliationReport
 *   }
 * }
 *
 * POST /api/ingestion/jobs/[id]
 *
 * Perform actions on a job:
 * - action: "validate" - Validate pending job
 * - action: "commit" - Commit validated job
 * - action: "retry" - Retry failed job (re-validate and commit)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  getIngestionJob,
  getIngestionRows,
  getReconciliationReport,
  validateIngestionJob,
  commitIngestionJob,
  ROW_STATUSES,
  type RowStatus,
} from "@/lib/ingestion";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: jobId } = await params;
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID
  if (!UUID_REGEX.test(jobId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid job ID format", 400, correlationId);
  }

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required for ingestion", 403, correlationId);
  }

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);

    const includeRows = searchParams.get("include_rows") !== "false";
    const reportMode = searchParams.get("report") === "true";
    const rowStatusParam = searchParams.get("row_status");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    // If report mode, return reconciliation report
    if (reportMode) {
      const reportResult = await getReconciliationReport(supabaseAdmin, jobId);

      if (!reportResult.ok) {
        return createApiErrorResponse("NOT_FOUND", reportResult.error || "Job not found", 404, correlationId);
      }

      return NextResponse.json({
        ok: true,
        data: {
          report: reportResult.report,
        },
        correlation_id: correlationId,
      });
    }

    // Fetch job
    const jobResult = await getIngestionJob(supabaseAdmin, jobId);

    if (!jobResult.ok || !jobResult.job) {
      return createApiErrorResponse("NOT_FOUND", jobResult.error || "Job not found", 404, correlationId);
    }

    // Optionally fetch rows
    let rows = undefined;
    let rowsTotal = undefined;

    if (includeRows) {
      // Validate row_status
      let rowStatus: RowStatus | undefined;
      if (rowStatusParam) {
        if (!ROW_STATUSES.includes(rowStatusParam as RowStatus)) {
          return createApiErrorResponse(
            "BAD_REQUEST",
            `Invalid row_status. Must be one of: ${ROW_STATUSES.join(", ")}`,
            400,
            correlationId
          );
        }
        rowStatus = rowStatusParam as RowStatus;
      }

      const limit = Math.min(Math.max(parseInt(limitParam || "100", 10) || 100, 1), 500);
      const offset = Math.max(parseInt(offsetParam || "0", 10) || 0, 0);

      const rowsResult = await getIngestionRows(supabaseAdmin, {
        job_id: jobId,
        status: rowStatus,
        limit,
        offset,
      });

      if (rowsResult.ok) {
        rows = rowsResult.rows;
        rowsTotal = rowsResult.total;
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        job: jobResult.job,
        rows,
        rows_total: rowsTotal,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/ingestion/jobs/[id] error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: jobId } = await params;
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID
  if (!UUID_REGEX.test(jobId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid job ID format", 400, correlationId);
  }

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required for ingestion", 403, correlationId);
  }

  const actor = authContext.user?.id || "admin";

  // Parse body
  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  // Validate action
  const action = body.action;
  if (!action || !["validate", "commit", "retry"].includes(action)) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "action must be one of: validate, commit, retry",
      400
    , correlationId);
  }

  try {
    // Fetch job to check current state
    const jobResult = await getIngestionJob(supabaseAdmin, jobId);

    if (!jobResult.ok || !jobResult.job) {
      return createApiErrorResponse("NOT_FOUND", jobResult.error || "Job not found", 404, correlationId);
    }

    const job = jobResult.job;

    switch (action) {
      case "validate": {
        if (job.status !== "pending") {
          return createApiErrorResponse(
            "PRECONDITION_FAILED",
            `Cannot validate job in status '${job.status}'`,
            409
          , correlationId);
        }

        const validateResult = await validateIngestionJob(supabaseAdmin, {
          job_id: jobId,
          actor,
        });

        return NextResponse.json({
          ok: validateResult.ok,
          data: {
            job: validateResult.job,
            validated_count: validateResult.validated_count,
            failed_count: validateResult.failed_count,
            duplicate_count: validateResult.duplicate_count,
            errors: validateResult.errors,
          },
          correlation_id: correlationId,
        });
      }

      case "commit": {
        if (job.status !== "validated") {
          return createApiErrorResponse(
            "PRECONDITION_FAILED",
            `Cannot commit job in status '${job.status}'`,
            409
          , correlationId);
        }

        const commitResult = await commitIngestionJob(supabaseAdmin, {
          job_id: jobId,
          actor,
          correlation_id: correlationId,
        });

        return NextResponse.json({
          ok: commitResult.ok,
          data: {
            job: commitResult.job,
            committed_count: commitResult.committed_count,
            failed_count: commitResult.failed_count,
            created_video_ids: commitResult.created_video_ids,
          },
          correlation_id: correlationId,
        });
      }

      case "retry": {
        // Retry is only allowed for failed jobs
        if (job.status !== "failed" && job.status !== "partial") {
          return createApiErrorResponse(
            "PRECONDITION_FAILED",
            `Cannot retry job in status '${job.status}'`,
            409
          , correlationId);
        }

        // Reset failed rows to pending and re-validate
        await supabaseAdmin
          .from("video_ingestion_rows")
          .update({ status: "pending", error: null, validated_at: null })
          .eq("job_id", jobId)
          .eq("status", "failed");

        // Reset job to pending
        await supabaseAdmin
          .from("video_ingestion_jobs")
          .update({
            status: "pending",
            validated_at: null,
            committed_at: null,
            completed_at: null,
          })
          .eq("id", jobId);

        // Re-validate
        const validateResult = await validateIngestionJob(supabaseAdmin, {
          job_id: jobId,
          actor,
        });

        if (!validateResult.ok || validateResult.validated_count === 0) {
          return NextResponse.json({
            ok: validateResult.ok,
            data: {
              job: validateResult.job,
              validated_count: validateResult.validated_count,
              failed_count: validateResult.failed_count,
              duplicate_count: validateResult.duplicate_count,
              errors: validateResult.errors,
            },
            correlation_id: correlationId,
          });
        }

        // Commit
        const commitResult = await commitIngestionJob(supabaseAdmin, {
          job_id: jobId,
          actor,
          correlation_id: correlationId,
        });

        return NextResponse.json({
          ok: commitResult.ok,
          data: {
            job: commitResult.job,
            validated_count: validateResult.validated_count,
            committed_count: commitResult.committed_count,
            failed_count: validateResult.failed_count + commitResult.failed_count,
            created_video_ids: commitResult.created_video_ids,
          },
          correlation_id: correlationId,
        });
      }

      default: {
        return createApiErrorResponse("BAD_REQUEST", "Unknown action", 400, correlationId);
      }
    }
  } catch (err) {
    console.error("POST /api/ingestion/jobs/[id] error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
