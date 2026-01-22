import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { getMemoryClaim, clearMemoryClaim } from "@/lib/claimCache";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const VIDEO_SELECT = "id,variant_id,account_id,status,google_drive_url,created_at,claimed_by,claimed_at,claim_expires_at";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  if (!id || typeof id !== "string") {
    const err = apiError("BAD_REQUEST", "Video ID is required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

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

  const { claimed_by, force } = body as Record<string, unknown>;

  if (typeof claimed_by !== "string" || claimed_by.trim() === "") {
    const err = apiError("BAD_REQUEST", "claimed_by is required and must be a non-empty string", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const forceRelease = force === true;

  try {
    // Check if claim columns exist (migration 010)
    const existingColumns = await getVideosColumns();
    const hasClaimColumns = existingColumns.has("claimed_by") && existingColumns.has("claim_expires_at");

    // Build SELECT based on available columns
    const selectCols = hasClaimColumns ? "id,claimed_by" : "id";

    // Check video exists
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select(selectCols)
      .eq("id", id)
      .single();

    if (fetchError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404, { video_id: id });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // If claim columns don't exist, use in-memory cache for release
    if (!hasClaimColumns) {
      const existingClaim = getMemoryClaim(id);
      if (existingClaim && !forceRelease && existingClaim.claimed_by !== claimed_by.trim()) {
        const err = apiError("BAD_REQUEST", "Claimed by another user", 409, {
          current_claimed_by: existingClaim.claimed_by
        });
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
      clearMemoryClaim(id);
      const { data: fullVideo } = await supabaseAdmin
        .from("videos")
        .select("*")
        .eq("id", id)
        .single();
      return NextResponse.json({ ok: true, data: fullVideo, correlation_id: correlationId });
    }

    // Check ownership unless force
    if (!forceRelease && video.claimed_by !== claimed_by.trim()) {
      const err = apiError("BAD_REQUEST", "Claimed by another user", 409, {
        current_claimed_by: video.claimed_by
      });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Release the claim
    let query = supabaseAdmin
      .from("videos")
      .update({
        claimed_by: null,
        claimed_at: null,
        claim_expires_at: null
      })
      .eq("id", id);

    // If not forcing, also require claimed_by match
    if (!forceRelease) {
      query = query.eq("claimed_by", claimed_by.trim());
    }

    const { data: updated, error: updateError } = await query
      .select(VIDEO_SELECT)
      .single();

    if (updateError || !updated) {
      const err = apiError("BAD_REQUEST", "Failed to release claim", 409, { video_id: id });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write audit event
    await writeVideoEvent(id, "release", correlationId, "api", {
      claimed_by: claimed_by.trim(),
      force: forceRelease
    });

    return NextResponse.json({ ok: true, data: updated, correlation_id: correlationId });

  } catch (err) {
    console.error("POST /api/videos/[id]/release error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
