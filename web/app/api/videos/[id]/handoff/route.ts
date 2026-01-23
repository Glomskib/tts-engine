import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const VALID_CLAIM_ROLES = ["recorder", "editor", "uploader", "admin"] as const;
type ClaimRole = typeof VALID_CLAIM_ROLES[number];

const VIDEO_SELECT = "id,variant_id,account_id,status,google_drive_url,created_at,claimed_by,claimed_at,claim_expires_at,claim_role,recording_status";

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

  const { from_user, to_user, to_role, ttl_minutes, force } = body as Record<string, unknown>;

  // Validate from_user
  if (typeof from_user !== "string" || from_user.trim() === "") {
    const err = apiError("BAD_REQUEST", "from_user is required and must be a non-empty string", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate to_user
  if (typeof to_user !== "string" || to_user.trim() === "") {
    const err = apiError("BAD_REQUEST", "to_user is required and must be a non-empty string", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate to_role
  if (!VALID_CLAIM_ROLES.includes(to_role as ClaimRole)) {
    const err = apiError("INVALID_ROLE", `to_role must be one of: ${VALID_CLAIM_ROLES.join(", ")}`, 400, { provided: to_role });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const ttl = typeof ttl_minutes === "number" && ttl_minutes > 0 ? ttl_minutes : 120;
  const forceHandoff = force === true;

  try {
    // Check if claim columns exist (migration 010 + 015)
    const existingColumns = await getVideosColumns();
    const hasClaimColumns = existingColumns.has("claimed_by") && existingColumns.has("claim_expires_at") && existingColumns.has("claim_role");

    if (!hasClaimColumns) {
      const err = apiError("BAD_REQUEST", "Handoff requires claim columns (migrations 010 and 015)", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Fetch current video
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select(VIDEO_SELECT)
      .eq("id", id)
      .single();

    if (fetchError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404, { video_id: id });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const now = new Date().toISOString();

    // Validate current claim belongs to from_user (unless force)
    const hasValidClaim =
      typeof video.claimed_by === "string" &&
      video.claimed_by.trim() !== "" &&
      video.claim_expires_at &&
      video.claim_expires_at > now;

    if (!forceHandoff) {
      if (!hasValidClaim) {
        const err = apiError("NOT_CLAIMED", "Video is not currently claimed", 409, {
          claimed_by: video.claimed_by || null,
          claim_expires_at: video.claim_expires_at || null,
        });
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }

      if (video.claimed_by !== from_user.trim()) {
        const err = apiError("CLAIM_NOT_OWNED", `Video is claimed by ${video.claimed_by}, not ${from_user}`, 403, {
          claimed_by: video.claimed_by,
          from_user: from_user.trim(),
        });
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
    }

    // Perform handoff: transfer claim to new user with new role
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("videos")
      .update({
        claimed_by: to_user.trim(),
        claimed_at: now,
        claim_expires_at: expiresAt,
        claim_role: to_role,
      })
      .eq("id", id)
      .select(VIDEO_SELECT)
      .single();

    if (updateError || !updated) {
      const err = apiError("DB_ERROR", "Failed to perform handoff", 500, { video_id: id });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write audit event
    await writeVideoEvent(id, "handoff", correlationId, from_user.trim(), {
      from_user: from_user.trim(),
      from_role: video.claim_role || null,
      to_user: to_user.trim(),
      to_role,
      ttl_minutes: ttl,
      force: forceHandoff,
    });

    return NextResponse.json({
      ok: true,
      data: updated,
      meta: {
        from_user: from_user.trim(),
        from_role: video.claim_role || null,
        to_user: to_user.trim(),
        to_role,
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/videos/[id]/handoff error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
