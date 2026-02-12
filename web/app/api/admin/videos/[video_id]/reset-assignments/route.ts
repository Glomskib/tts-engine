import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { triggerEmailNotification } from "@/lib/email-notifications";
import { checkIncidentReadOnlyBlock } from "@/lib/settings";

export const runtime = "nodejs";

const VALID_MODES = ["expire", "unassign"] as const;
type ResetMode = typeof VALID_MODES[number];

interface RouteParams {
  params: Promise<{ video_id: string }>;
}

async function writeVideoEvent(
  videoId: string,
  eventType: string,
  correlationId: string,
  actor: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: eventType,
      correlation_id: correlationId,
      actor,
      from_status: null,
      to_status: null,
      details,
    });
  } catch (err) {
    console.error("Failed to write video event:", err);
  }
}

/**
 * POST /api/admin/videos/[video_id]/reset-assignments
 * Admin-only. Reset assignment state for a video.
 * Body: { mode: "expire"|"unassign", reason: string }
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { video_id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(video_id)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  // Incident mode read-only check (admin bypass - this will always pass for admins)
  const incidentCheck = await checkIncidentReadOnlyBlock(authContext.user.id, authContext.isAdmin);
  if (incidentCheck.blocked) {
    return NextResponse.json({
      ok: false,
      error: "incident_mode_read_only",
      message: incidentCheck.message || "System is in maintenance mode.",
      correlation_id: correlationId,
    }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const { mode, reason } = body as { mode?: string; reason?: string };

  // Validate mode
  if (!mode || !VALID_MODES.includes(mode as ResetMode)) {
    return createApiErrorResponse("BAD_REQUEST", `mode must be one of: ${VALID_MODES.join(", ")}`, 400, correlationId);
  }

  // Validate reason
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return createApiErrorResponse("BAD_REQUEST", "reason is required and must be non-empty", 400, correlationId);
  }

  try {
    // Check if assignment columns exist
    const existingColumns = await getVideosColumns();
    const hasAssignmentColumns = existingColumns.has("assignment_state") && existingColumns.has("assigned_expires_at");

    if (!hasAssignmentColumns) {
      return createApiErrorResponse("BAD_REQUEST", "Assignment columns not available (migration 019 not applied)", 400, correlationId);
    }

    // Fetch current video
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id,assigned_to,assigned_role,assigned_at,assigned_expires_at,assignment_state")
      .eq("id", video_id)
      .single();

    if (fetchError || !video) {
      return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
    }

    const previousState = {
      assigned_to: video.assigned_to,
      assigned_role: video.assigned_role,
      assigned_at: video.assigned_at,
      assigned_expires_at: video.assigned_expires_at,
      assignment_state: video.assignment_state,
    };

    // Build update based on mode
    let updatePayload: Record<string, unknown>;
    let newState: string;

    if (mode === "expire") {
      // Mark as EXPIRED
      newState = "EXPIRED";
      updatePayload = {
        assignment_state: "EXPIRED",
      };
    } else {
      // Unassign: clear all assignment fields
      newState = "UNASSIGNED";
      updatePayload = {
        assigned_to: null,
        assigned_role: null,
        assigned_at: null,
        assigned_expires_at: null,
        assignment_state: "UNASSIGNED",
      };
    }

    // Update the video
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("videos")
      .update(updatePayload)
      .eq("id", video_id)
      .select("id,assigned_to,assigned_role,assigned_at,assigned_expires_at,assignment_state")
      .single();

    if (updateError) {
      console.error("Reset assignments error:", updateError);
      return createApiErrorResponse("DB_ERROR", "Failed to reset assignments", 500, correlationId);
    }

    // Emit event
    await writeVideoEvent(video_id, "admin_reset_assignments", correlationId, authContext.user.id, {
      reset_by: authContext.user.email || authContext.user.id,
      mode,
      reason: reason.trim(),
      from_state: previousState.assignment_state,
      to_state: newState,
      previous_assigned_to: previousState.assigned_to,
      previous_assigned_role: previousState.assigned_role,
    });

    // Trigger email notification (fail-safe)
    triggerEmailNotification("admin_reset_assignments", video_id, {
      adminUserId: authContext.user.id,
      performed_by: authContext.user.email || authContext.user.id,
      reason: reason.trim(),
      mode,
      from_state: previousState.assignment_state,
      to_state: newState,
    });

    return NextResponse.json({
      ok: true,
      data: updated,
      meta: {
        mode,
        from_state: previousState.assignment_state,
        to_state: newState,
        previous_assigned_to: previousState.assigned_to,
        reset_by: authContext.user.email || authContext.user.id,
        reason: reason.trim(),
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/admin/videos/[video_id]/reset-assignments error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
