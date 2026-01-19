import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { VIDEO_STATUSES, VideoStatus } from "@/lib/schema-migration";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "Video ID is required" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
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
  if (status !== undefined && (typeof status !== "string" || !VIDEO_STATUSES.includes(status as VideoStatus))) {
    return NextResponse.json(
      { 
        ok: false, 
        error: `Invalid status. Must be one of: ${VIDEO_STATUSES.join(", ")}` 
      },
      { status: 400 }
    );
  }

  // Build update payload - only use existing columns
  const updatePayload: Record<string, unknown> = {};

  // Only update fields that exist in current schema
  if (status !== undefined) {
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
    return NextResponse.json(
      { ok: false, error: "No valid fields provided for update" },
      { status: 400 }
    );
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
        return NextResponse.json(
          { ok: false, error: "Video not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });

  } catch (err) {
    console.error("PATCH /api/videos/[id] error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
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
