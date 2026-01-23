import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { checkAndExpireUserAssignment } from "@/lib/assignment-expiry";

export const runtime = "nodejs";

// Lane configuration: which recording_status each role works on
const LANE_STATUS: Record<string, string> = {
  recorder: "NOT_RECORDED",
  editor: "RECORDED", // Editor also handles EDITED
  uploader: "READY_TO_POST",
};

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const userId = authContext.user.id;
  const userRole = authContext.role;

  // Determine lane based on role
  const laneStatus = userRole && LANE_STATUS[userRole];

  try {
    const existingColumns = await getVideosColumns();
    const hasAssignmentColumns = existingColumns.has("assignment_state") && existingColumns.has("assigned_expires_at");

    if (!hasAssignmentColumns) {
      return NextResponse.json({
        ok: true,
        data: null,
        message: "Assignment columns not available (migration 019 not applied)",
        correlation_id: correlationId,
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Check and expire any expired assignments for this user (opportunistic cleanup)
    const { hadExpired, expiredVideoIds } = await checkAndExpireUserAssignment(
      userId,
      userRole,
      now,
      correlationId
    );

    // Find active assignment for this user
    let query = supabaseAdmin
      .from("videos")
      .select("id,recording_status,assignment_state,assigned_expires_at,assigned_role,claimed_by,claim_expires_at")
      .eq("assigned_to", userId)
      .eq("assignment_state", "ASSIGNED")
      .gt("assigned_expires_at", nowIso)
      .limit(1);

    // If user has a specific role (not admin), filter by lane
    if (laneStatus) {
      // For editor, include both RECORDED and EDITED statuses
      if (userRole === "editor") {
        query = query.in("recording_status", ["RECORDED", "EDITED"]);
      } else {
        query = query.eq("recording_status", laneStatus);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/videos/my-active error:", error);
      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        ok: true,
        data: null,
        previous_expired: hadExpired,
        expired_video_ids: hadExpired ? expiredVideoIds : undefined,
        correlation_id: correlationId,
      });
    }

    const video = data[0];

    return NextResponse.json({
      ok: true,
      data: {
        video_id: video.id,
        recording_status: video.recording_status,
        assignment_state: video.assignment_state,
        assigned_expires_at: video.assigned_expires_at,
        assigned_role: video.assigned_role,
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("GET /api/videos/my-active error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
