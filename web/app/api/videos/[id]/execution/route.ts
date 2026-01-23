import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId, isAdminUser } from "@/lib/api-errors";
import {
  RECORDING_STATUSES,
  isValidRecordingStatus,
  validateStatusTransition,
  type RecordingStatus,
  type VideoForValidation,
} from "@/lib/execution-stages";
import { getVideosColumns } from "@/lib/videosSchema";
import { getApiAuthContext, type UserRole } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

const VALID_CLAIM_ROLES = ["recorder", "editor", "uploader", "admin"] as const;
type ClaimRole = typeof VALID_CLAIM_ROLES[number];

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
