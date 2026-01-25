/**
 * video-status-machine.ts
 *
 * Centralized, atomic video status transition system.
 * All status changes MUST go through this module.
 *
 * Key properties:
 * - Atomic: uses UPDATE ... WHERE to prevent race conditions
 * - Idempotent: transitioning to current status is a no-op success
 * - Validated: all transitions checked against ALLOWED_TRANSITIONS
 * - Audited: all transitions emit video_events
 * - Precondition-enforced: queue statuses require active claim
 */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  VideoStatus,
  isValidStatus,
  canTransition,
  isQueueStatus,
  requiresReason,
  getAllowedNextStatuses,
  ALLOWED_TRANSITIONS,
} from "./video-pipeline";

// ============================================================================
// Types
// ============================================================================

export interface TransitionParams {
  video_id: string;
  actor: string;
  target_status: VideoStatus;
  reason_code?: string;
  reason_message?: string;
  correlation_id: string;
  /** If true, skip claim check (for admin operations) */
  force?: boolean;
  /** Additional fields to update alongside status */
  additional_updates?: Record<string, unknown>;
}

export interface TransitionResult {
  ok: boolean;
  video_id: string;
  action: "transitioned" | "no_change" | "invalid_transition" | "not_found" | "claim_required" | "reason_required" | "precondition_failed" | "error";
  previous_status?: VideoStatus | null;
  current_status?: VideoStatus | null;
  message: string;
  error_code?: string;
  allowed_next?: readonly VideoStatus[];
}

// ============================================================================
// Video Event Writer
// ============================================================================

async function writeVideoEvent(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    event_type: string;
    correlation_id: string;
    actor: string;
    from_status: string | null;
    to_status: string | null;
    details: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from("video_events").insert({
      video_id: params.video_id,
      event_type: params.event_type,
      correlation_id: params.correlation_id,
      actor: params.actor,
      from_status: params.from_status,
      to_status: params.to_status,
      details: params.details,
    });
  } catch (err) {
    console.error(`Failed to write video event ${params.event_type}:`, err);
  }
}

// ============================================================================
// Precondition Checks
// ============================================================================

interface ClaimInfo {
  claimed_by: string | null;
  claim_expires_at: string | null;
}

function hasActiveClaim(claim: ClaimInfo): boolean {
  if (!claim.claimed_by || !claim.claim_expires_at) {
    return false;
  }
  return claim.claim_expires_at > new Date().toISOString();
}

function isClaimOwner(claim: ClaimInfo, actor: string): boolean {
  return claim.claimed_by === actor && hasActiveClaim(claim);
}

// ============================================================================
// Main Transition Function
// ============================================================================

/**
 * Atomically transition a video's status.
 *
 * This is the ONLY function that should be used to change video status.
 *
 * Properties:
 * - Validates transition against ALLOWED_TRANSITIONS
 * - Enforces claim requirement for queue statuses
 * - Enforces reason requirement for failed/archived
 * - Performs atomic UPDATE ... WHERE status = current_status
 * - Is idempotent: if already at target_status, returns success
 * - Emits exactly-once event on successful transition
 *
 * @param supabase - Supabase admin client
 * @param params - Transition parameters
 * @returns TransitionResult with outcome
 */
export async function transitionVideoStatusAtomic(
  supabase: SupabaseClient,
  params: TransitionParams
): Promise<TransitionResult> {
  const {
    video_id,
    actor,
    target_status,
    reason_code,
    reason_message,
    correlation_id,
    force = false,
    additional_updates = {},
  } = params;

  // Validate target_status is a valid status
  if (!isValidStatus(target_status)) {
    return {
      ok: false,
      video_id,
      action: "invalid_transition",
      message: `Invalid target status: ${target_status}`,
      error_code: "INVALID_STATUS",
    };
  }

  // Fetch current video state
  const { data: video, error: fetchError } = await supabase
    .from("videos")
    .select("id, status, claimed_by, claim_expires_at")
    .eq("id", video_id)
    .single();

  if (fetchError || !video) {
    return {
      ok: false,
      video_id,
      action: "not_found",
      message: "Video not found",
      error_code: "NOT_FOUND",
    };
  }

  const currentStatus = video.status as VideoStatus;

  // Idempotency: if already at target status, return success
  if (currentStatus === target_status) {
    return {
      ok: true,
      video_id,
      action: "no_change",
      previous_status: currentStatus,
      current_status: currentStatus,
      message: `Video is already in status '${target_status}'`,
    };
  }

  // Validate transition is allowed
  if (!canTransition(currentStatus, target_status)) {
    const allowed = getAllowedNextStatuses(currentStatus);

    // Write audit event for invalid transition attempt
    await writeVideoEvent(supabase, {
      video_id,
      event_type: "transition_rejected",
      correlation_id,
      actor,
      from_status: currentStatus,
      to_status: target_status,
      details: {
        error_code: "INVALID_TRANSITION",
        allowed_next: allowed,
        reason: `Transition from '${currentStatus}' to '${target_status}' is not allowed`,
      },
    });

    return {
      ok: false,
      video_id,
      action: "invalid_transition",
      previous_status: currentStatus,
      current_status: currentStatus,
      message: `Invalid transition: '${currentStatus}' -> '${target_status}'`,
      error_code: "INVALID_TRANSITION",
      allowed_next: allowed,
    };
  }

  // Enforce claim requirement for queue statuses (unless force=true)
  if (!force && isQueueStatus(currentStatus)) {
    const claimInfo: ClaimInfo = {
      claimed_by: video.claimed_by,
      claim_expires_at: video.claim_expires_at,
    };

    if (!isClaimOwner(claimInfo, actor)) {
      // Write audit event for claim required error
      await writeVideoEvent(supabase, {
        video_id,
        event_type: "transition_rejected",
        correlation_id,
        actor,
        from_status: currentStatus,
        to_status: target_status,
        details: {
          error_code: "CLAIM_REQUIRED",
          claimed_by: video.claimed_by,
          claim_expires_at: video.claim_expires_at,
          reason: "Video must be claimed by actor before changing status",
        },
      });

      return {
        ok: false,
        video_id,
        action: "claim_required",
        previous_status: currentStatus,
        current_status: currentStatus,
        message: "Video must be claimed before changing status",
        error_code: "CLAIM_REQUIRED",
      };
    }
  }

  // Enforce reason requirement for failed/archived statuses
  if (requiresReason(target_status)) {
    if (!reason_code || !reason_message) {
      return {
        ok: false,
        video_id,
        action: "reason_required",
        previous_status: currentStatus,
        current_status: currentStatus,
        message: `Transition to '${target_status}' requires reason_code and reason_message`,
        error_code: "REASON_REQUIRED",
      };
    }
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    status: target_status,
    ...additional_updates,
  };

  // Store reason if provided
  if (reason_code || reason_message) {
    updatePayload.status_reason = JSON.stringify({
      code: reason_code || null,
      message: reason_message || null,
      changed_at: new Date().toISOString(),
      changed_by: actor,
    });
  }

  // Auto-clear claim when transitioning to terminal states
  if (target_status === "posted" || target_status === "failed" || target_status === "archived") {
    updatePayload.claimed_by = null;
    updatePayload.claimed_at = null;
    updatePayload.claim_expires_at = null;
    updatePayload.claim_role = null;
  }

  // Atomic UPDATE with WHERE clause to prevent race conditions
  // This ensures the status hasn't changed since we checked
  const { data: updated, error: updateError } = await supabase
    .from("videos")
    .update(updatePayload)
    .eq("id", video_id)
    .eq("status", currentStatus) // Atomic: only update if status unchanged
    .select("id, status")
    .maybeSingle();

  if (updateError) {
    console.error("Status transition error:", updateError);
    return {
      ok: false,
      video_id,
      action: "error",
      previous_status: currentStatus,
      message: `Database error: ${updateError.message}`,
      error_code: "DB_ERROR",
    };
  }

  if (!updated) {
    // Race condition: status changed between check and update
    // Re-fetch to get current state
    const { data: current } = await supabase
      .from("videos")
      .select("status")
      .eq("id", video_id)
      .single();

    // Check if it's now at target (concurrent success)
    if (current?.status === target_status) {
      return {
        ok: true,
        video_id,
        action: "no_change",
        previous_status: currentStatus,
        current_status: target_status,
        message: "Status was updated concurrently to target",
      };
    }

    return {
      ok: false,
      video_id,
      action: "precondition_failed",
      previous_status: currentStatus,
      current_status: current?.status || null,
      message: "Status changed during transition (race condition)",
      error_code: "CONFLICT",
    };
  }

  // Write audit event for successful transition
  await writeVideoEvent(supabase, {
    video_id,
    event_type: "status_change",
    correlation_id,
    actor,
    from_status: currentStatus,
    to_status: target_status,
    details: {
      previous_status: currentStatus,
      new_status: target_status,
      reason_code: reason_code || null,
      reason_message: reason_message || null,
      force,
    },
  });

  return {
    ok: true,
    video_id,
    action: "transitioned",
    previous_status: currentStatus,
    current_status: target_status,
    message: `Status changed from '${currentStatus}' to '${target_status}'`,
  };
}

// ============================================================================
// Validation Helper (for API routes)
// ============================================================================

/**
 * Validate a status transition without performing it.
 * Useful for pre-flight checks in API routes.
 */
export function validateTransition(
  currentStatus: string,
  targetStatus: string
): {
  valid: boolean;
  error_code?: string;
  message?: string;
  allowed_next?: readonly VideoStatus[];
} {
  if (!isValidStatus(currentStatus)) {
    return {
      valid: false,
      error_code: "INVALID_STATUS",
      message: `Current status '${currentStatus}' is not a valid status`,
    };
  }

  if (!isValidStatus(targetStatus)) {
    return {
      valid: false,
      error_code: "INVALID_STATUS",
      message: `Target status '${targetStatus}' is not a valid status`,
    };
  }

  if (currentStatus === targetStatus) {
    return { valid: true }; // Idempotent
  }

  if (!canTransition(currentStatus as VideoStatus, targetStatus as VideoStatus)) {
    return {
      valid: false,
      error_code: "INVALID_TRANSITION",
      message: `Transition from '${currentStatus}' to '${targetStatus}' is not allowed`,
      allowed_next: getAllowedNextStatuses(currentStatus as VideoStatus),
    };
  }

  return { valid: true };
}

// ============================================================================
// Export transition map for reference
// ============================================================================

export { ALLOWED_TRANSITIONS };
