import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { getVideosColumns } from "@/lib/videosSchema";

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
    const err = apiError("INVALID_UUID", "Invalid video ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Get auth context
  const authContext = await getApiAuthContext();

  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Admin-only endpoint
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Only admins can assign videos", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { assignee_user_id, notes } = body as { assignee_user_id?: string; notes?: string };

  // Validate assignee_user_id
  if (!assignee_user_id || !uuidRegex.test(assignee_user_id)) {
    const err = apiError("BAD_REQUEST", "assignee_user_id is required and must be a valid UUID", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Check if assignment columns exist
    const existingColumns = await getVideosColumns();
    const hasAssignmentColumns = existingColumns.has("assigned_to") && existingColumns.has("assigned_at");

    if (!hasAssignmentColumns) {
      const err = apiError("NOT_AVAILABLE", "Assignment feature requires migration 018_video_assignment.sql", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Verify video exists
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id, assigned_to")
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
      const err = apiError("DB_ERROR", updateError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
