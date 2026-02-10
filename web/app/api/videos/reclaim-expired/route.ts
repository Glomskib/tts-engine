import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only endpoint
  const authContext = await getApiAuthContext(request);
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required for reclaim-expired", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const actor = authContext.user?.id || "admin";

  try {
    const existingColumns = await getVideosColumns();
    const hasWorkPackageColumns = existingColumns.has("assignment_state") && existingColumns.has("assigned_expires_at");

    if (!hasWorkPackageColumns) {
      const err = apiError("BAD_REQUEST", "Reclaim requires work package columns (migration 019)", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const now = new Date().toISOString();

    // Find all expired assignments
    const { data: expired, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id,assigned_to,assigned_role,assigned_expires_at")
      .eq("assignment_state", "ASSIGNED")
      .lt("assigned_expires_at", now);

    if (fetchError) {
      console.error("Reclaim fetch error:", fetchError);
      const err = apiError("DB_ERROR", fetchError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    if (!expired || expired.length === 0) {
      return NextResponse.json({
        ok: true,
        reclaimed_count: 0,
        message: "No expired assignments found",
        correlation_id: correlationId,
      });
    }

    const expiredIds = expired.map((v: { id: string }) => v.id);

    // Update all expired assignments to EXPIRED state
    // Keep assigned_to for history but mark as expired
    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update({
        assignment_state: "EXPIRED",
      })
      .in("id", expiredIds);

    if (updateError) {
      console.error("Reclaim update error:", updateError);
      const err = apiError("DB_ERROR", "Failed to reclaim expired assignments", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write events for each reclaimed video
    for (const video of expired as { id: string; assigned_to: string | null; assigned_role: string | null; assigned_expires_at: string | null }[]) {
      await writeVideoEvent(video.id, "assignment_expired", correlationId, actor, {
        previous_assigned_to: video.assigned_to,
        previous_assigned_role: video.assigned_role,
        expired_at: video.assigned_expires_at,
        reclaimed_at: now,
      });
    }

    return NextResponse.json({
      ok: true,
      reclaimed_count: expiredIds.length,
      reclaimed_ids: expiredIds,
      message: `Reclaimed ${expiredIds.length} expired assignment(s)`,
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/videos/reclaim-expired error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
