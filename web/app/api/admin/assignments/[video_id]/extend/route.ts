import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

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
 * POST /api/admin/assignments/[video_id]/extend
 * Admin-only. Extend an active assignment's TTL.
 * Body: { ttl_minutes: number }
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
  const authContext = await getApiAuthContext(request);
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

  const { ttl_minutes } = body as { ttl_minutes?: number };

  if (typeof ttl_minutes !== "number" || ttl_minutes <= 0) {
    const err = apiError("BAD_REQUEST", "ttl_minutes is required and must be a positive number", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

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
      .select("id,assigned_to,assigned_role,assignment_state,assigned_expires_at")
      .eq("id", video_id)
      .single();

    if (fetchError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    if (video.assignment_state !== "ASSIGNED") {
      const err = apiError("BAD_REQUEST", `Cannot extend: assignment_state is ${video.assignment_state}, not ASSIGNED`, 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + ttl_minutes * 60 * 1000).toISOString();
    const previousExpiresAt = video.assigned_expires_at;

    // Update the assignment
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("videos")
      .update({ assigned_expires_at: newExpiresAt })
      .eq("id", video_id)
      .select("id,assigned_to,assigned_role,assignment_state,assigned_expires_at")
      .single();

    if (updateError) {
      console.error("Extend assignment error:", updateError);
      const err = apiError("DB_ERROR", "Failed to extend assignment", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write event
    await writeVideoEvent(video_id, "assignment_extended", correlationId, authContext.user.id, {
      extended_by: authContext.user.email || authContext.user.id,
      previous_expires_at: previousExpiresAt,
      new_expires_at: newExpiresAt,
      ttl_minutes,
    });

    // Notify assignee
    if (video.assigned_to) {
      await insertNotification(video.assigned_to, "assignment_extended", video_id, {
        extended_by: authContext.user.email || "Admin",
        new_expires_at: newExpiresAt,
        ttl_minutes,
      });
    }

    return NextResponse.json({
      ok: true,
      data: updated,
      meta: {
        previous_expires_at: previousExpiresAt,
        new_expires_at: newExpiresAt,
        ttl_minutes,
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/admin/assignments/[video_id]/extend error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
