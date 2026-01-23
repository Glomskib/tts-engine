import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { getMemoryClaim, setMemoryClaim } from "@/lib/claimCache";
import { QUEUE_STATUSES } from "@/lib/video-pipeline";
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

  const { claimed_by, ttl_minutes } = body as Record<string, unknown>;

  if (typeof claimed_by !== "string" || claimed_by.trim() === "") {
    const err = apiError("BAD_REQUEST", "claimed_by is required and must be a non-empty string", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const ttl = typeof ttl_minutes === "number" && ttl_minutes > 0 ? ttl_minutes : 120;

  try {
    // Check if claim columns exist (migration 010)
    const existingColumns = await getVideosColumns();
    const hasClaimColumns = existingColumns.has("claimed_by") && existingColumns.has("claim_expires_at");

    const now = new Date().toISOString();

    if (!hasClaimColumns) {
      // No claim columns: use literal select, then in-memory cache
      const { data: video, error: fetchError } = await supabaseAdmin
        .from("videos")
        .select("id,status")
        .eq("id", id)
        .single();

      if (fetchError || !video) {
        const err = apiError("NOT_FOUND", "Video not found", 404, { video_id: id });
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
      if (!QUEUE_STATUSES.includes(video.status as typeof QUEUE_STATUSES[number])) {
        const err = apiError("BAD_REQUEST", "Video is not in a claimable queue status", 400, { status: video.status });
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }

      const existingClaim = getMemoryClaim(id);
      if (existingClaim && existingClaim.claimed_by !== claimed_by.trim()) {
        const err = apiError("ALREADY_CLAIMED", `Video is already claimed by ${existingClaim.claimed_by}`, 409, {
          claimed_by: existingClaim.claimed_by,
          claim_expires_at: existingClaim.claim_expires_at
        });
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
      setMemoryClaim(id, claimed_by.trim(), ttl);
      const { data: fullVideo } = await supabaseAdmin
        .from("videos")
        .select("*")
        .eq("id", id)
        .single();
      return NextResponse.json({ ok: true, data: fullVideo, correlation_id: correlationId });
    }

    // Claim columns exist: use literal select with claimed_by, claim_expires_at
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id,status,claimed_by,claim_expires_at")
      .eq("id", id)
      .single();

    if (fetchError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404, { video_id: id });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    if (!QUEUE_STATUSES.includes(video.status as typeof QUEUE_STATUSES[number])) {
      const err = apiError("BAD_REQUEST", "Video is not in a claimable queue status", 400, { status: video.status });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Check for valid active claim: claimed_by must be a non-empty string AND claim_expires_at must be in the future
    const hasValidClaim =
      typeof video.claimed_by === "string" &&
      video.claimed_by.trim() !== "" &&
      video.claim_expires_at &&
      video.claim_expires_at > now;

    if (hasValidClaim) {
      // Allow same user to re-claim (extend)
      if (video.claimed_by === claimed_by.trim()) {
        // Same user re-claiming - allow extension
      } else {
        const err = apiError("ALREADY_CLAIMED", `Video is already claimed by ${video.claimed_by}`, 409, {
          claimed_by: video.claimed_by,
          claim_expires_at: video.claim_expires_at
        });
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
    }

    // Detect and auto-clear corrupt state: claim_expires_at set but claimed_by is null/empty
    const isCorruptState =
      (!video.claimed_by || (typeof video.claimed_by === "string" && video.claimed_by.trim() === "")) &&
      video.claim_expires_at;

    if (isCorruptState) {
      // Auto-clear the corrupt claim_expires_at before proceeding
      await supabaseAdmin
        .from("videos")
        .update({ claimed_by: null, claimed_at: null, claim_expires_at: null })
        .eq("id", id);
    }

    // Atomic claim: update only if unclaimed, expired, or same user re-claiming
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

    // Build filter: allow claim if claimed_by is null, claim_expires_at is null, claim_expires_at < now, or same user
    const filterParts = [
      "claimed_by.is.null",
      "claim_expires_at.is.null",
      `claim_expires_at.lt.${now}`,
      `claimed_by.eq.${claimed_by.trim()}`
    ];

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("videos")
      .update({
        claimed_by: claimed_by.trim(),
        claimed_at: now,
        claim_expires_at: expiresAt
      })
      .eq("id", id)
      .or(filterParts.join(","))
      .select(VIDEO_SELECT);

    // Check if update succeeded (at least one row returned)
    const updated = updatedRows && updatedRows.length > 0 ? updatedRows[0] : null;

    if (updateError || !updated) {
      // Race condition: someone else claimed it — re-fetch for claimed_by/claim_expires_at
      const { data: conflict } = await supabaseAdmin
        .from("videos")
        .select("claimed_by,claim_expires_at")
        .eq("id", id)
        .single();
      const err = apiError(
        "ALREADY_CLAIMED",
        `Video is already claimed by ${conflict?.claimed_by ?? "unknown"}`,
        409,
        { claimed_by: conflict?.claimed_by ?? null, claim_expires_at: conflict?.claim_expires_at ?? null }
      );
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write audit event
    await writeVideoEvent(id, "claim", correlationId, "api", {
      claimed_by: claimed_by.trim(),
      ttl_minutes: ttl
    });

    return NextResponse.json({ ok: true, data: updated, correlation_id: correlationId });

  } catch (err) {
    console.error("POST /api/videos/[id]/claim error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
