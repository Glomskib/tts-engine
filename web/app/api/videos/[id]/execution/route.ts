import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId, isAdminUser } from "@/lib/api-errors";
import { createHookSuggestionsFromVideo } from "@/lib/hook-suggestions";
import { applyHookPostedCounts } from "@/lib/hook-usage-counts";
import { auditLogAsync, AuditEventTypes, EntityTypes } from "@/lib/audit";
import {
  RECORDING_STATUSES,
  isValidRecordingStatus,
  validateStatusTransition,
  type RecordingStatus,
  type VideoForValidation,
} from "@/lib/execution-stages";
import { getVideosColumns } from "@/lib/videosSchema";
import { getApiAuthContext, type UserRole } from "@/lib/supabase/api-auth";
import { canPerformGatedAction } from "@/lib/subscription";
import { checkIncidentReadOnlyBlock } from "@/lib/settings";

export const runtime = "nodejs";

const VALID_CLAIM_ROLES = ["recorder", "editor", "uploader", "admin"] as const;
type ClaimRole = typeof VALID_CLAIM_ROLES[number];

// Lane boundaries for auto-handoff
// Maps from_status -> to_status to the next role
const HANDOFF_CONFIG: Record<string, { nextRole: ClaimRole | null }> = {
  "NOT_RECORDED->RECORDED": { nextRole: "editor" },
  "RECORDED->EDITED": { nextRole: null }, // Still editor, no handoff
  "EDITED->READY_TO_POST": { nextRole: "uploader" },
  "READY_TO_POST->POSTED": { nextRole: null }, // Terminal
  // REJECTED has no handoff
};

// Default user IDs for each role (from env)
function getDefaultUserForRole(role: ClaimRole): string | null {
  switch (role) {
    case "recorder":
      return process.env.DEFAULT_RECORDER_USER_ID || null;
    case "editor":
      return process.env.DEFAULT_EDITOR_USER_ID || null;
    case "uploader":
      return process.env.DEFAULT_UPLOADER_USER_ID || null;
    default:
      return null;
  }
}

async function insertNotification(
  userId: string,
  type: string,
  videoId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type,
      video_id: videoId,
      payload,
    });
  } catch (err) {
    console.error("Failed to insert notification:", err);
  }
}

async function writeVideoEvent(
  videoId: string,
  eventType: string,
  correlationId: string,
  actor: string,
  fromStatus: string | null,
  toStatus: string | null,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: eventType,
      correlation_id: correlationId,
      actor,
      from_status: fromStatus,
      to_status: toStatus,
      details,
    });
  } catch (err) {
    console.error("Failed to write video event:", err);
  }
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Invalid video ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const {
    recording_status,
    recorded_at,
    edited_at,
    ready_to_post_at,
    posted_at,
    rejected_at,
    recording_notes,
    editor_notes,
    uploader_notes,
    posted_url,
    posted_platform,
    posted_account,
    posted_at_local,
    posting_error,
    // Legacy fields (still accepted for test compatibility, but auth takes precedence)
    updated_by,
    actor_role,
    force,
    require_claim,
  } = body as Record<string, unknown>;

  // Get authentication context from session
  const authContext = await getApiAuthContext();

  // Determine actor: prefer authenticated user, fallback to legacy updated_by for tests
  const isAuthenticated = authContext.user !== null;
  const actor = authContext.user
    ? authContext.user.id
    : (typeof updated_by === "string" ? updated_by.trim() : null);

  // Determine role: prefer authenticated role, fallback to legacy actor_role for tests
  const actorRole: UserRole | null = isAuthenticated
    ? authContext.role
    : (typeof actor_role === "string" && VALID_CLAIM_ROLES.includes(actor_role as ClaimRole)
      ? (actor_role as UserRole)
      : null);

  // Check if claim enforcement is enabled (default: true)
  const enforceClaimCheck = require_claim !== false;

  // If require_claim=true and not authenticated and no legacy actor, require auth
  if (enforceClaimCheck && recording_status !== undefined && !actor) {
    const err = apiError(
      "MISSING_ACTOR",
      "Authentication required. Please sign in to update recording status.",
      401,
      { hint: "Sign in or set require_claim=false for test mode" }
    );
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Force bypass is only allowed for admin users
  const forceRequested = force === true;
  // Admin check: prefer role check, fallback to legacy ADMIN_USERS check for tests
  const isAdmin = actorRole === "admin" || (!isAuthenticated && isAdminUser(actor));
  if (forceRequested && !isAdmin) {
    const err = apiError(
      "FORBIDDEN",
      "force=true is only allowed for admin users",
      403,
      { actor, actor_role: actorRole, hint: "Only admin users can use force" }
    );
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Subscription gating check (fail-safe: allows if not configured)
  // Only check if we have an authenticated user and recording_status is changing
  if (isAuthenticated && actor && recording_status !== undefined) {
    const subscriptionCheck = await canPerformGatedAction(actor, isAdmin);
    if (!subscriptionCheck.allowed) {
      return NextResponse.json({
        ok: false,
        error: subscriptionCheck.reason || "subscription_required",
        message: "Upgrade required to submit status changes.",
        correlation_id: correlationId,
      }, { status: 403 });
    }
  }

  // Incident mode read-only check (admin bypass)
  if (isAuthenticated && actor && recording_status !== undefined) {
    const incidentCheck = await checkIncidentReadOnlyBlock(actor, isAdmin);
    if (incidentCheck.blocked) {
      return NextResponse.json({
        ok: false,
        error: "incident_mode_read_only",
        message: incidentCheck.message || "System is in maintenance mode.",
        correlation_id: correlationId,
      }, { status: 503 });
    }
  }

  // Validate recording_status if provided
  if (recording_status !== undefined && !isValidRecordingStatus(recording_status)) {
    const err = apiError("INVALID_RECORDING_STATUS", `Invalid recording_status. Must be one of: ${RECORDING_STATUSES.join(', ')}`, 400, {
      provided: recording_status,
      allowed: RECORDING_STATUSES,
    });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Fetch current video
  const { data: currentVideo, error: fetchError } = await supabaseAdmin
    .from("videos")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    const err = apiError("DB_ERROR", fetchError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Role-based claim enforcement
  const existingColumns = await getVideosColumns();
  const hasClaimColumns = existingColumns.has("claimed_by") && existingColumns.has("claim_expires_at") && existingColumns.has("claim_role");
  const hasAssignmentColumns = existingColumns.has("assignment_state") && existingColumns.has("assigned_expires_at");

  if (enforceClaimCheck && hasClaimColumns && recording_status !== undefined) {
    const now = new Date().toISOString();
    const isClaimedByUser =
      currentVideo.claimed_by &&
      currentVideo.claimed_by === actor &&
      currentVideo.claim_expires_at &&
      currentVideo.claim_expires_at > now;

    // Admin users with force can bypass claim ownership check
    if (!isClaimedByUser && !(forceRequested && isAdmin)) {
      const err = apiError(
        "CLAIM_NOT_OWNED",
        `You must claim this video before updating execution status. Current claimant: ${currentVideo.claimed_by || "none"}`,
        403,
        {
          claimed_by: currentVideo.claimed_by || null,
          claim_expires_at: currentVideo.claim_expires_at || null,
          actor: actor || null,
        }
      );
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Assignment enforcement (if work package columns exist)
    // For non-admins: if assigned_to exists and != actor => reject
    if (hasAssignmentColumns && !(forceRequested && isAdmin)) {
      const assignedTo = currentVideo.assigned_to as string | null;
      const assignmentState = currentVideo.assignment_state as string | null;
      const assignedExpiresAt = currentVideo.assigned_expires_at as string | null;

      // Check if there's an active assignment
      if (assignedTo && assignmentState === "ASSIGNED") {
        // Check if assignment is expired
        if (assignedExpiresAt && assignedExpiresAt < now) {
          const err = apiError(
            "ASSIGNMENT_EXPIRED",
            "Your assignment has expired. Please dispatch again to get a new assignment.",
            409,
            {
              assigned_to: assignedTo,
              assigned_expires_at: assignedExpiresAt,
              actor: actor,
            }
          );
          return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
        }

        // Check if assigned to someone else
        if (assignedTo !== actor) {
          const err = apiError(
            "NOT_ASSIGNED_TO_YOU",
            `This video is assigned to another user. You cannot update its status.`,
            403,
            {
              assigned_to: assignedTo,
              actor: actor,
            }
          );
          return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
        }
      }
    }

    // Validate role matches the action (role-based gating)
    // Admin users with force can bypass role checks
    const claimRole = currentVideo.claim_role as ClaimRole | null;
    if (claimRole && claimRole !== "admin" && !(forceRequested && isAdmin)) {
      // Map recording_status transitions to expected roles
      const roleForStatus: Record<string, ClaimRole[]> = {
        RECORDED: ["recorder", "admin"],
        EDITED: ["editor", "admin"],
        READY_TO_POST: ["editor", "admin"],
        POSTED: ["uploader", "admin"],
        REJECTED: ["recorder", "editor", "uploader", "admin"],
      };

      const allowedRoles = roleForStatus[recording_status as string];
      if (allowedRoles && !allowedRoles.includes(claimRole)) {
        const err = apiError(
          "ROLE_MISMATCH",
          `Your claim role (${claimRole}) does not match the required role for this action. Expected: ${allowedRoles.join(" or ")}`,
          403,
          {
            current_role: claimRole,
            required_role: allowedRoles,
            attempted_status: recording_status,
          }
        );
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
    }
  }

  const previousRecordingStatus = currentVideo.recording_status;

  // If transitioning to a new status, validate the transition
  if (recording_status !== undefined && recording_status !== previousRecordingStatus) {
    // Build merged video state for validation (current + pending updates)
    const videoForValidation: VideoForValidation = {
      recording_status: recording_status as string,
      recording_notes: (recording_notes as string | undefined) ?? currentVideo.recording_notes,
      editor_notes: (editor_notes as string | undefined) ?? currentVideo.editor_notes,
      uploader_notes: (uploader_notes as string | undefined) ?? currentVideo.uploader_notes,
      posted_url: (posted_url as string | undefined) ?? currentVideo.posted_url,
      posted_platform: (posted_platform as string | undefined) ?? currentVideo.posted_platform,
      final_video_url: currentVideo.final_video_url,
      google_drive_url: currentVideo.google_drive_url,
      script_locked_text: currentVideo.script_locked_text,
    };

    const validation = validateStatusTransition(
      recording_status as RecordingStatus,
      videoForValidation,
      forceRequested && isAdmin
    );

    if (!validation.valid && validation.code) {
      const err = apiError(
        validation.code,
        `${validation.error} (use force=true to override)`,
        400,
        validation.details || {}
      );
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {};
  const now = new Date().toISOString();

  if (recording_status !== undefined) {
    updatePayload.recording_status = recording_status;

    // Update last_status_changed_at if status is actually changing
    if (recording_status !== previousRecordingStatus) {
      updatePayload.last_status_changed_at = now;
    }

    // Auto-set timestamps based on status if not provided
    if (recording_status === 'RECORDED' && recorded_at === undefined && !currentVideo.recorded_at) {
      updatePayload.recorded_at = now;
    }
    if (recording_status === 'EDITED' && edited_at === undefined && !currentVideo.edited_at) {
      updatePayload.edited_at = now;
    }
    if (recording_status === 'READY_TO_POST' && ready_to_post_at === undefined && !currentVideo.ready_to_post_at) {
      updatePayload.ready_to_post_at = now;
    }
    if (recording_status === 'POSTED' && posted_at === undefined && !currentVideo.posted_at) {
      updatePayload.posted_at = now;
    }
    if (recording_status === 'REJECTED' && rejected_at === undefined && !currentVideo.rejected_at) {
      updatePayload.rejected_at = now;
    }
  }

  // Handle explicit timestamp overrides
  if (recorded_at !== undefined) updatePayload.recorded_at = recorded_at;
  if (edited_at !== undefined) updatePayload.edited_at = edited_at;
  if (ready_to_post_at !== undefined) updatePayload.ready_to_post_at = ready_to_post_at;
  if (posted_at !== undefined) updatePayload.posted_at = posted_at;
  if (rejected_at !== undefined) updatePayload.rejected_at = rejected_at;

  // Handle notes fields
  if (recording_notes !== undefined) updatePayload.recording_notes = recording_notes;
  if (editor_notes !== undefined) updatePayload.editor_notes = editor_notes;
  if (uploader_notes !== undefined) updatePayload.uploader_notes = uploader_notes;

  // Handle posting fields
  if (posted_url !== undefined) updatePayload.posted_url = posted_url;
  if (posted_platform !== undefined) updatePayload.posted_platform = posted_platform;
  if (posted_account !== undefined) updatePayload.posted_account = posted_account;
  if (posted_at_local !== undefined) updatePayload.posted_at_local = posted_at_local;
  if (posting_error !== undefined) updatePayload.posting_error = posting_error;

  // If no valid fields to update
  if (Object.keys(updatePayload).length === 0) {
    const err = apiError("BAD_REQUEST", "No valid fields provided for update", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Perform update
  const { data: updatedVideo, error: updateError } = await supabaseAdmin
    .from("videos")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to update video execution:", updateError);
    const err = apiError("DB_ERROR", updateError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Log video_event if recording_status changed
  if (recording_status !== undefined && recording_status !== previousRecordingStatus) {
    await writeVideoEvent(
      id,
      "recording_status_changed",
      correlationId,
      actor || "api",
      previousRecordingStatus,
      recording_status as string,
      {
        recording_notes: recording_notes || null,
        editor_notes: editor_notes || null,
        uploader_notes: uploader_notes || null,
        posted_url: posted_url || null,
        posted_platform: posted_platform || null,
        force: forceRequested,
        actor_role: actorRole,
        authenticated: isAuthenticated,
      }
    );

    // Auto-handoff logic: complete current assignment and assign to next role
    if (hasAssignmentColumns && previousRecordingStatus && recording_status) {
      const transitionKey = `${previousRecordingStatus}->${recording_status}`;
      const handoffConfig = HANDOFF_CONFIG[transitionKey];

      // Complete current assignment if exists
      if (currentVideo.assignment_state === "ASSIGNED" && currentVideo.assigned_to === actor) {
        await supabaseAdmin
          .from("videos")
          .update({ assignment_state: "COMPLETED" })
          .eq("id", id);

        await writeVideoEvent(id, "assignment_completed", correlationId, actor || "api", null, null, {
          role: currentVideo.assigned_role,
          from_status: previousRecordingStatus,
          to_status: recording_status,
        });
      }

      // Set up next assignment if there's a handoff
      if (handoffConfig?.nextRole) {
        const nextRole = handoffConfig.nextRole;
        const defaultUser = getDefaultUserForRole(nextRole);
        const ttl = currentVideo.assigned_ttl_minutes || 240;
        const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

        if (defaultUser) {
          // Auto-assign to default user for the role
          await supabaseAdmin
            .from("videos")
            .update({
              assigned_to: defaultUser,
              assigned_at: now,
              assigned_expires_at: expiresAt,
              assigned_role: nextRole,
              assignment_state: "ASSIGNED",
              work_lane: nextRole,
            })
            .eq("id", id);

          await writeVideoEvent(id, "auto_handoff", correlationId, actor || "api", null, null, {
            from_role: currentVideo.assigned_role,
            to_role: nextRole,
            assigned_to: defaultUser,
            from_status: previousRecordingStatus,
            to_status: recording_status,
          });

          // Notify the next user
          await insertNotification(defaultUser, "assigned", id, {
            from_status: previousRecordingStatus,
            to_status: recording_status,
            role: nextRole,
            auto_assigned: true,
          });
        } else {
          // No default user - mark as unassigned and notify admins
          await supabaseAdmin
            .from("videos")
            .update({
              assigned_to: null,
              assigned_at: null,
              assigned_expires_at: null,
              assigned_role: nextRole, // Keep role for dispatch targeting
              assignment_state: "UNASSIGNED",
              work_lane: nextRole,
            })
            .eq("id", id);

          await writeVideoEvent(id, "handoff_pending", correlationId, actor || "api", null, null, {
            from_role: currentVideo.assigned_role,
            to_role: nextRole,
            from_status: previousRecordingStatus,
            to_status: recording_status,
            reason: "no_default_user",
          });
        }
      }
    }

    // Create hook suggestions when video is posted (fail-safe, non-blocking)
    if (recording_status === "POSTED") {
      // Audit log for POSTED transition
      auditLogAsync({
        correlation_id: correlationId,
        event_type: AuditEventTypes.VIDEO_POSTED,
        entity_type: EntityTypes.VIDEO,
        entity_id: id,
        actor: actor || "api",
        summary: `Video ${id} marked as POSTED`,
        details: {
          previous_status: previousRecordingStatus,
          posted_url: posted_url || null,
          posted_platform: posted_platform || null,
          posted_account: posted_account || null,
        },
      });

      // Fetch brand from product if available (needed for both suggestions and usage counts)
      let brandName: string | null = null;
      if (currentVideo.product_id) {
        try {
          const { data: product } = await supabaseAdmin
            .from("products")
            .select("brand")
            .eq("id", currentVideo.product_id)
            .single();
          brandName = product?.brand || null;
        } catch (err) {
          console.error("Failed to fetch brand for hook processing:", err);
        }
      }

      // Create hook suggestions
      try {
        const suggestionsResult = await createHookSuggestionsFromVideo(
          supabaseAdmin,
          {
            id,
            product_id: currentVideo.product_id,
            selected_spoken_hook: currentVideo.selected_spoken_hook,
            selected_visual_hook: currentVideo.selected_visual_hook,
            selected_on_screen_hook: currentVideo.selected_on_screen_hook,
          },
          brandName
        );

        if (suggestionsResult.created > 0 || suggestionsResult.skipped > 0) {
          await writeVideoEvent(id, "hook_suggestions_created", correlationId, actor || "api", null, null, {
            created: suggestionsResult.created,
            skipped: suggestionsResult.skipped,
            errors: suggestionsResult.errors,
          });
        }
      } catch (err) {
        // Fail-safe: log but don't fail the main request
        console.error("Failed to create hook suggestions:", err);
      }

      // Increment posted_count and used_count on matching proven_hooks (fail-safe, non-blocking)
      if (brandName) {
        try {
          const usageResult = await applyHookPostedCounts(
            supabaseAdmin,
            id,
            {
              selected_spoken_hook: currentVideo.selected_spoken_hook,
              selected_visual_hook: currentVideo.selected_visual_hook,
              selected_on_screen_hook: currentVideo.selected_on_screen_hook,
            },
            brandName
          );

          if (usageResult.counts_incremented > 0 || usageResult.skipped_duplicate > 0) {
            await writeVideoEvent(id, "hook_usage_counts_applied", correlationId, actor || "api", null, null, {
              hooks_found: usageResult.hooks_found,
              counts_incremented: usageResult.counts_incremented,
              skipped_duplicate: usageResult.skipped_duplicate,
              skipped_no_match: usageResult.skipped_no_match,
              errors: usageResult.errors,
            });
          }
        } catch (err) {
          // Fail-safe: log but don't fail the main request
          console.error("Failed to apply hook usage counts:", err);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    data: updatedVideo,
    meta: {
      previous_recording_status: previousRecordingStatus,
      new_recording_status: updatedVideo.recording_status,
    },
    correlation_id: correlationId,
  });
}
