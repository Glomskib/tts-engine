import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { triggerEmailNotification } from "@/lib/email-notifications";

export const runtime = "nodejs";

const VALID_ROLES = ["recorder", "editor", "uploader", "admin"] as const;
type AssignRole = typeof VALID_ROLES[number];

const DEFAULT_TTL_MINUTES = 240;

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

/**
 * POST /api/admin/assignments/[video_id]/reassign
 * Admin-only. Reassign a video to a different user.
 * Body: { to_user_id: string, to_role: recorder|editor|uploader|admin, ttl_minutes?: number, notes?: string }
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { video_id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(video_id)) {
    const err = apiError("INVALID_UUID", "Invalid video ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Admin-only check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { to_user_id, to_role, ttl_minutes, notes } = body as {
    to_user_id?: string;
    to_role?: string;
    ttl_minutes?: number;
    notes?: string;
  };

  // Validate to_user_id
  if (!to_user_id || !uuidRegex.test(to_user_id)) {
    const err = apiError("BAD_REQUEST", "to_user_id is required and must be a valid UUID", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate to_role
  if (!to_role || !VALID_ROLES.includes(to_role as AssignRole)) {
    const err = apiError("BAD_REQUEST", `to_role must be one of: ${VALID_ROLES.join(", ")}`, 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const ttl = typeof ttl_minutes === "number" && ttl_minutes > 0 ? ttl_minutes : DEFAULT_TTL_MINUTES;

  try {
    const existingColumns = await getVideosColumns();
    const hasAssignmentColumns = existingColumns.has("assignment_state") && existingColumns.has("assigned_expires_at");

    if (!hasAssignmentColumns) {
      const err = apiError("BAD_REQUEST", "Assignment columns not available (migration 019)", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Fetch current video
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id,assigned_to,assigned_role,assignment_state,assigned_expires_at,recording_status")
      .eq("id", video_id)
      .single();

    if (fetchError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const newExpiresAt = new Date(now.getTime() + ttl * 60 * 1000).toISOString();

    const previousAssignee = video.assigned_to;
    const previousRole = video.assigned_role;
    const previousState = video.assignment_state;

    // Update the assignment
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("videos")
      .update({
        assigned_to: to_user_id,
        assigned_role: to_role,
        assigned_at: nowIso,
        assigned_expires_at: newExpiresAt,
        assignment_state: "ASSIGNED",
        work_lane: to_role !== "admin" ? to_role : video.recording_status === "NOT_RECORDED" ? "recorder" : null,
      })
      .eq("id", video_id)
      .select("id,assigned_to,assigned_role,assignment_state,assigned_expires_at,recording_status")
      .single();

    if (updateError) {
      console.error("Reassign error:", updateError);
      const err = apiError("DB_ERROR", "Failed to reassign", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write event
    await writeVideoEvent(video_id, "assignment_reassigned", correlationId, authContext.user.id, {
      reassigned_by: authContext.user.email || authContext.user.id,
      from_user_id: previousAssignee,
      from_role: previousRole,
      from_state: previousState,
      to_user_id,
      to_role,
      ttl_minutes: ttl,
      notes: notes || null,
    });

    // Notify new assignee
    await insertNotification(to_user_id, "assignment_reassigned", video_id, {
      reassigned_by: authContext.user.email || "Admin",
      role: to_role,
      expires_at: newExpiresAt,
      notes: notes || null,
    });

    // Notify previous assignee if different
    if (previousAssignee && previousAssignee !== to_user_id) {
      await insertNotification(previousAssignee, "assignment_removed", video_id, {
        removed_by: authContext.user.email || "Admin",
        reassigned_to: to_user_id,
        notes: notes || null,
      });
    }

    // Trigger email notification (fail-safe)
    triggerEmailNotification("assignment_reassigned", video_id, {
      assignedUserId: to_user_id,
      role: to_role,
      reassignedBy: authContext.user.email || authContext.user.id,
    });

    return NextResponse.json({
      ok: true,
      data: updated,
      meta: {
        previous_assignee: previousAssignee,
        previous_role: previousRole,
        new_assignee: to_user_id,
        new_role: to_role,
        expires_at: newExpiresAt,
        ttl_minutes: ttl,
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/admin/assignments/[video_id]/reassign error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
