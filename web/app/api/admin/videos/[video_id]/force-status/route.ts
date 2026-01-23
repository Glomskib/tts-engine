import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

const VALID_STATUSES = ["NOT_RECORDED", "RECORDED", "EDITED", "READY_TO_POST", "POSTED"] as const;
type RecordingStatus = typeof VALID_STATUSES[number];

interface RouteParams {
  params: Promise<{ video_id: string }>;
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

/**
 * POST /api/admin/videos/[video_id]/force-status
 * Admin-only. Force set recording_status to correct stuck videos.
 * Body: { target_status: string, reason: string, posted_url?: string, posted_platform?: string }
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

  const { target_status, reason, posted_url, posted_platform } = body as {
    target_status?: string;
    reason?: string;
    posted_url?: string;
    posted_platform?: string;
  };

  // Validate target_status
  if (!target_status || !VALID_STATUSES.includes(target_status as RecordingStatus)) {
    const err = apiError("BAD_REQUEST", `target_status must be one of: ${VALID_STATUSES.join(", ")}`, 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate reason
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    const err = apiError("BAD_REQUEST", "reason is required and must be non-empty", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Fetch current video
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id,recording_status,posted_url,posted_platform")
      .eq("id", video_id)
      .single();

    if (fetchError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const fromStatus = video.recording_status || "NOT_RECORDED";

    // Field gating for POSTED status
    if (target_status === "POSTED") {
      const finalPostedUrl = posted_url || video.posted_url;
      const finalPostedPlatform = posted_platform || video.posted_platform;

      if (!finalPostedUrl || !finalPostedPlatform) {
        const err = apiError(
          "BAD_REQUEST",
          "POSTED status requires posted_url and posted_platform. Provide them in the request or ensure the video already has them.",
          400
        );
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
    }

    // Build update payload
    const now = new Date();
    const nowIso = now.toISOString();
    const updatePayload: Record<string, unknown> = {
      recording_status: target_status,
      last_status_changed_at: nowIso,
    };

    // Set timestamps based on target status
    if (target_status === "RECORDED") {
      updatePayload.recorded_at = nowIso;
    } else if (target_status === "EDITED") {
      updatePayload.edited_at = nowIso;
    } else if (target_status === "READY_TO_POST") {
      updatePayload.ready_to_post_at = nowIso;
    } else if (target_status === "POSTED") {
      updatePayload.posted_at = nowIso;
      if (posted_url) updatePayload.posted_url = posted_url;
      if (posted_platform) updatePayload.posted_platform = posted_platform;
    }

    // Update the video
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("videos")
      .update(updatePayload)
      .eq("id", video_id)
      .select("id,recording_status,posted_url,posted_platform,last_status_changed_at")
      .single();

    if (updateError) {
      console.error("Force status error:", updateError);
      const err = apiError("DB_ERROR", "Failed to update video status", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Emit event
    await writeVideoEvent(
      video_id,
      "admin_force_status",
      correlationId,
      authContext.user.id,
      fromStatus,
      target_status,
      {
        forced_by: authContext.user.email || authContext.user.id,
        reason: reason.trim(),
        from_status: fromStatus,
        to_status: target_status,
        posted_url: posted_url || null,
        posted_platform: posted_platform || null,
      }
    );

    return NextResponse.json({
      ok: true,
      data: updated,
      meta: {
        from_status: fromStatus,
        to_status: target_status,
        reason: reason.trim(),
        forced_by: authContext.user.email || authContext.user.id,
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/admin/videos/[video_id]/force-status error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
