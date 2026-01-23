import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { isValidStatus, assertVideoTransition, VideoStatus, allowedTransitions, QUEUE_STATUSES } from "@/lib/video-pipeline";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Video ID must be a valid UUID", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    const err = apiError("DB_ERROR", error.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Generate or read correlation ID
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const { id } = await params;

  if (!id || typeof id !== "string") {
    const err = apiError("BAD_REQUEST", "Video ID is required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Video ID must be a valid UUID", 400, { provided: id });
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
    status, 
    google_drive_url,
    final_video_url, 
    caption_used, 
    hashtags_used, 
    tt_post_url, 
    posted_at, 
    notes 
  } = body as Record<string, unknown>;

  // Validate status if provided
  if (status !== undefined) {
    if (typeof status !== "string" || !isValidStatus(status)) {
      const err = apiError("INVALID_STATUS", "Invalid status value", 400, { provided: status });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
  }

  // Build update payload - only use existing columns
  const updatePayload: Record<string, unknown> = {};
  let previousStatus: VideoStatus | null = null;

  // If status is changing, validate the transition
  if (status !== undefined) {
    // Fetch current video to check transition and claim status
    const { data: currentVideo, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("status,claimed_by,claim_expires_at")
      .eq("id", id)
      .single();

    if (fetchError || !currentVideo) {
      const err = apiError("NOT_FOUND", "Video not found", 404, { video_id: id });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const currentStatus = currentVideo.status as VideoStatus;
    previousStatus = currentStatus;

    if (currentStatus && isValidStatus(currentStatus) && currentStatus !== status) {
      try {
        assertVideoTransition(currentStatus, status as VideoStatus);
      } catch (err) {
        // Write audit event for invalid transition
        await writeVideoEvent(
          id,
          "error",
          correlationId,
          "api",
          currentStatus,
          status as string,
          {
            code: "INVALID_TRANSITION",
            from_status: currentStatus,
            to_status: status,
            allowed: allowedTransitions[currentStatus],
            message: (err as Error).message
          }
        );

        const apiErr = apiError("INVALID_TRANSITION", (err as Error).message, 400, {
          from: currentStatus,
          to: status,
          allowed: allowedTransitions[currentStatus]
        });
        return NextResponse.json({ ...apiErr.body, correlation_id: correlationId }, { status: apiErr.status });
      }

      // Enforce claim for transitions FROM queue statuses
      if (QUEUE_STATUSES.includes(currentStatus as typeof QUEUE_STATUSES[number])) {
        const now = new Date().toISOString();
        const isClaimed = currentVideo.claimed_by && currentVideo.claim_expires_at && currentVideo.claim_expires_at > now;
        
        if (!isClaimed) {
          // Write audit event for claim required error
          await writeVideoEvent(
            id,
            "error",
            correlationId,
            "api",
            currentStatus,
            status as string,
            {
              code: "CLAIM_REQUIRED",
              message: "Video must be claimed before changing status",
              claimed_by: currentVideo.claimed_by,
              claim_expires_at: currentVideo.claim_expires_at
            }
          );

          const apiErr = apiError("BAD_REQUEST", "Video must be claimed before changing status", 409, {
            status: currentStatus,
            claimed_by: currentVideo.claimed_by,
            claim_expires_at: currentVideo.claim_expires_at
          });
          return NextResponse.json({ ...apiErr.body, correlation_id: correlationId }, { status: apiErr.status });
        }
      }

      // Auto-clear claim when transitioning to posted or failed
      if (status === "posted" || status === "failed") {
        updatePayload.claimed_by = null;
        updatePayload.claimed_at = null;
        updatePayload.claim_expires_at = null;
      }
    }
    updatePayload.status = status;
  }

  // Handle google_drive_url mapping - if request includes final_video_url, update google_drive_url
  if (google_drive_url !== undefined) {
    updatePayload.google_drive_url = google_drive_url;
  } else if (final_video_url !== undefined) {
    updatePayload.google_drive_url = final_video_url;
  }

  // Do not attempt to update columns that don't exist yet

  // If no valid fields to update
  if (Object.keys(updatePayload).length === 0) {
    const err = apiError("BAD_REQUEST", "No valid fields provided for update", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("videos")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("PATCH /api/videos/[id] Supabase error:", error);
      console.error("PATCH /api/videos/[id] update payload:", updatePayload);

      if (error.code === "PGRST116") {
        const err = apiError("NOT_FOUND", "Video not found", 404, { video_id: id });
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }

      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write audit event for successful status change
    if (status !== undefined && previousStatus !== null && previousStatus !== status) {
      await writeVideoEvent(
        id,
        "status_change",
        correlationId,
        "api",
        previousStatus,
        status as string,
        {}
      );
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });

  } catch (err) {
    console.error("PATCH /api/videos/[id] error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}

/*
PowerShell Test Plan:

# 1. Get existing video ID from videos table
$videosResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos" -Method GET
$videoId = $videosResponse.data[0].id

# 2. Update video status via PATCH /api/videos/{id}
$updateBody = "{`"status`": `"ready_to_upload`", `"final_video_url`": `"https://drive.google.com/file/d/updated123`"}"
$updateResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$videoId" -Method PATCH -ContentType "application/json" -Body $updateBody
$updateResponse

# 3. Update video with TikTok post info
$postUpdateBody = "{`"status`": `"posted`", `"tt_post_url`": `"https://tiktok.com/@user/video/123456`", `"posted_at`": `"2026-01-19T10:00:00Z`"}"
$postUpdateResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$videoId" -Method PATCH -ContentType "application/json" -Body $postUpdateBody
$postUpdateResponse
*/
