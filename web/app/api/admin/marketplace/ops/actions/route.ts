import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AdminAction = "force_unclaim" | "requeue_stalled";

const VALID_STATUSES_FOR_UNCLAIM = new Set(["claimed", "in_progress", "changes_requested"]);

/**
 * POST /api/admin/marketplace/ops/actions
 *
 * Emergency admin actions for marketplace jobs.
 * Supports: force_unclaim, requeue_stalled.
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const auth = await getApiAuthContext(request);

  if (!auth.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  let body: { action: string; job_id: string; reason: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { action, job_id, reason } = body;

  if (!action || !job_id || !reason) {
    return createApiErrorResponse("BAD_REQUEST", "action, job_id, and reason are required", 400, correlationId);
  }

  if (action !== "force_unclaim" && action !== "requeue_stalled") {
    return createApiErrorResponse("BAD_REQUEST", `Unknown action: ${action}`, 400, correlationId);
  }

  // Fetch current job state
  const { data: job, error: jobErr } = await supabaseAdmin
    .from("edit_jobs")
    .select("id, job_status, claimed_by, script_id")
    .eq("id", job_id)
    .single();

  if (jobErr || !job) {
    return createApiErrorResponse("NOT_FOUND", "Job not found", 404, correlationId);
  }

  const typedAction = action as AdminAction;

  // Validate status for each action type
  if (typedAction === "force_unclaim" && !VALID_STATUSES_FOR_UNCLAIM.has(job.job_status)) {
    return createApiErrorResponse(
      "INVALID_TRANSITION",
      `Cannot force unclaim a job in status: ${job.job_status}. Must be claimed, in_progress, or changes_requested.`,
      409,
      correlationId,
    );
  }

  if (typedAction === "requeue_stalled" && job.job_status !== "in_progress") {
    return createApiErrorResponse(
      "INVALID_TRANSITION",
      `Cannot requeue stalled job in status: ${job.job_status}. Must be in_progress.`,
      409,
      correlationId,
    );
  }

  const previousStatus = job.job_status;
  const previousEditor = job.claimed_by;

  // Atomic update: set job back to queued, clear editor fields
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("edit_jobs")
    .update({
      job_status: "queued",
      claimed_by: null,
      claimed_at: null,
      started_at: null,
      submitted_at: null,
      last_heartbeat_at: null,
      stalled_at: null,
    })
    .eq("id", job_id)
    .eq("job_status", previousStatus)
    .select()
    .single();

  if (updateErr || !updated) {
    return createApiErrorResponse(
      "CONFLICT",
      "Job status changed concurrently — refresh and retry",
      409,
      correlationId,
    );
  }

  // Reset script status to queued
  await supabaseAdmin
    .from("mp_scripts")
    .update({ status: "queued" })
    .eq("id", job.script_id);

  // Insert audit event
  const eventType = typedAction === "force_unclaim" ? "admin_force_unclaim" : "admin_requeue_stalled";
  await supabaseAdmin.from("job_events").insert({
    job_id: job_id,
    event_type: eventType,
    actor_user_id: auth.user?.id || "admin",
    payload: {
      reason,
      previous_status: previousStatus,
      previous_editor: previousEditor,
    },
  });

  return NextResponse.json({
    ok: true,
    action: typedAction,
    job_id: job_id,
    previous_status: previousStatus,
    new_status: "queued",
    correlation_id: correlationId,
  });
}
