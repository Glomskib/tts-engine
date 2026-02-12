import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { createApiErrorResponse, generateCorrelationId, isAdminUser } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

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

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Get authentication context
  const authContext = await getApiAuthContext(request);

  // Determine actor
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is OK
  }

  const actor = authContext.user?.id || (typeof body.actor === "string" ? body.actor : null);
  const forceRequested = body.force === true;
  const isAdmin = authContext.isAdmin || isAdminUser(actor);

  if (!actor) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (forceRequested && !isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "force=true is only allowed for admin users", 403, correlationId);
  }

  try {
    const existingColumns = await getVideosColumns();
    const hasAssignmentColumns = existingColumns.has("assignment_state") && existingColumns.has("assigned_expires_at");

    if (!hasAssignmentColumns) {
      return createApiErrorResponse("BAD_REQUEST", "Assignment columns not available (migration 019)", 400, correlationId);
    }

    // Fetch current video
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id,assigned_to,assigned_role,assignment_state,recording_status")
      .eq("id", id)
      .single();

    if (fetchError || !video) {
      return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
    }

    // Check if caller is assigned (or admin with force)
    if (video.assigned_to !== actor && !(forceRequested && isAdmin)) {
      return createApiErrorResponse(
        "NOT_ASSIGNED_TO_YOU",
        "Only the assigned user can complete an assignment",
        403,
        correlationId,
        { assigned_to: video.assigned_to, actor }
      );
    }

    if (video.assignment_state !== "ASSIGNED") {
      return createApiErrorResponse("BAD_REQUEST", `Assignment is not active (current state: ${video.assignment_state})`, 400, correlationId);
    }

    const now = new Date().toISOString();

    // Mark assignment as completed
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("videos")
      .update({
        assignment_state: "COMPLETED",
        // Keep assigned_to for history
      })
      .eq("id", id)
      .select("id,assignment_state,assigned_to,assigned_role,recording_status")
      .single();

    if (updateError) {
      console.error("Complete assignment update error:", updateError);
      return createApiErrorResponse("DB_ERROR", "Failed to complete assignment", 500, correlationId);
    }

    // Write event
    await writeVideoEvent(id, "assignment_completed", correlationId, actor, {
      role: video.assigned_role,
      recording_status: video.recording_status,
      completed_at: now,
    });

    return NextResponse.json({
      ok: true,
      data: updated,
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/videos/[id]/complete-assignment error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
