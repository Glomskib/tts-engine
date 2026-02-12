import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { getVideosColumns } from "@/lib/videosSchema";
import { triggerEmailNotification } from "@/lib/email-notifications";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
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
 * POST /api/videos/[id]/assign
 * Admin-only: Assign a video to a specific user
 * Body: { assignee_user_id: uuid, notes?: string }
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Get auth context
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Admin-only endpoint
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Only admins can assign videos", 403, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const { assignee_user_id, notes } = body as { assignee_user_id?: string; notes?: string };

  // Validate assignee_user_id
  if (!assignee_user_id || !uuidRegex.test(assignee_user_id)) {
    return createApiErrorResponse("BAD_REQUEST", "assignee_user_id is required and must be a valid UUID", 400, correlationId);
  }

  try {
    // Check if assignment columns exist
    const existingColumns = await getVideosColumns();
    const hasAssignmentColumns = existingColumns.has("assigned_to") && existingColumns.has("assigned_at");

    if (!hasAssignmentColumns) {
      return createApiErrorResponse("NOT_AVAILABLE", "Assignment feature requires migration 018_video_assignment.sql", 400, correlationId);
    }

    // Verify video exists
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id, assigned_to")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
      }
      return createApiErrorResponse("DB_ERROR", fetchError.message, 500, correlationId);
    }

    const previousAssignee = video.assigned_to;
    const now = new Date().toISOString();

    // Update assignment
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("videos")
      .update({
        assigned_to: assignee_user_id,
        assigned_at: now,
        assigned_by: authContext.user.id,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to assign video:", updateError);
      return createApiErrorResponse("DB_ERROR", updateError.message, 500, correlationId);
    }

    // Write audit event
    await writeVideoEvent(id, "assigned", correlationId, authContext.user.id, {
      assignee_user_id,
      previous_assignee: previousAssignee || null,
      notes: notes || null,
      assigned_by_email: authContext.user.email || null,
    });

    // Insert notification for the assignee
    await insertNotification(assignee_user_id, "assigned", id, {
      assigned_by: authContext.user.email || authContext.user.id,
      notes: notes || null,
    });

    // Trigger email notification (fail-safe)
    triggerEmailNotification("assigned", id, {
      assignedUserId: assignee_user_id,
      role: "assigned",
    });

    return NextResponse.json({
      ok: true,
      data: updated,
      meta: {
        previous_assignee: previousAssignee || null,
        new_assignee: assignee_user_id,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/videos/[id]/assign error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
