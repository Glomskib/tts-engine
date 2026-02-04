/**
 * POST /api/admin/dev/reset-video-ready
 *
 * Admin-only endpoint to reset a video back to ready_to_post status.
 * Clears posted_* fields from posting_meta but preserves assets and script versions.
 *
 * Request body:
 * - video_id: string (required)
 *
 * PowerShell usage:
 * ```powershell
 * # Reset a video that was marked as posted back to ready_to_post
 * $videoId = "your-video-uuid-here"
 * $reset = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/dev/reset-video-ready" `
 *   -Method POST -ContentType "application/json" `
 *   -Body "{`"video_id`": `"$videoId`"}" -WebSession $session
 * $reset
 *
 * # The video should now appear in /uploader with the Post button again
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResetRequest {
  video_id: string;
}

interface PostingMetaWithPosted {
  target_account?: string | null;
  uploader_checklist_completed_at?: string | null;
  posted_url?: string | null;
  posted_at?: string | null;
  posted_by?: string | null;
  platform?: string | null;
}

async function writeVideoEvent(params: {
  video_id: string;
  event_type: string;
  correlation_id: string;
  actor: string;
  from_status: string | null;
  to_status: string | null;
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("video_events").insert({
      video_id: params.video_id,
      event_type: params.event_type,
      correlation_id: params.correlation_id,
      actor: params.actor,
      from_status: params.from_status,
      to_status: params.to_status,
      details: params.details,
    });
  } catch (err) {
    console.error("Failed to write video event:", err);
  }
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only access
  const authContext = await getApiAuthContext();
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const actor = authContext.user?.id || "admin";

  // Parse body
  let body: ResetRequest;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate video_id
  if (!body.video_id || typeof body.video_id !== "string") {
    const err = apiError("BAD_REQUEST", "video_id is required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  if (!UUID_REGEX.test(body.video_id)) {
    const err = apiError("INVALID_UUID", "Invalid video ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Fetch current video
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id, status, posting_meta")
      .eq("id", body.video_id)
      .single();

    if (fetchError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const previousStatus = video.status;
    const currentPostingMeta = (video.posting_meta || {}) as PostingMetaWithPosted;

    // Build new posting_meta without posted_* fields
    const newPostingMeta: PostingMetaWithPosted = {
      target_account: currentPostingMeta.target_account,
      // Intentionally omit:
      // - posted_url
      // - posted_at
      // - posted_by
      // - platform
      // - uploader_checklist_completed_at (reset checklist too)
    };

    // Update video
    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update({
        status: "ready_to_post",
        posting_meta: newPostingMeta,
      })
      .eq("id", body.video_id)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to reset video:", updateError);
      const err = apiError("DB_ERROR", `Failed to reset video: ${updateError.message}`, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write audit event
    await writeVideoEvent({
      video_id: body.video_id,
      event_type: "dev_reset_to_ready",
      correlation_id: correlationId,
      actor,
      from_status: previousStatus,
      to_status: "ready_to_post",
      details: {
        previous_posting_meta: currentPostingMeta,
        new_posting_meta: newPostingMeta,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        video_id: body.video_id,
        previous_status: previousStatus,
        new_status: "ready_to_post",
        posting_meta: newPostingMeta,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/dev/reset-video-ready error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
