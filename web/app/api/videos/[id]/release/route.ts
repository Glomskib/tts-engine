import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { getMemoryClaim, clearMemoryClaim } from "@/lib/claimCache";
import { apiError, generateCorrelationId, isAdminUser } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const VIDEO_SELECT_BASE = "id,variant_id,account_id,status,google_drive_url,created_at,claimed_by,claimed_at,claim_expires_at";
const VIDEO_SELECT_ROLE = ",claim_role";

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

  // Support both claimed_by (legacy) and released_by (preferred)
  const { claimed_by, released_by, force } = body as Record<string, unknown>;
  const actor = typeof released_by === "string" ? released_by.trim()
    : typeof claimed_by === "string" ? claimed_by.trim()
    : "";

  if (!actor) {
    const err = apiError("MISSING_ACTOR", "released_by is required and must be a non-empty string", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const forceRequested = force === true;
  const isAdmin = isAdminUser(actor);

  // Force is only allowed for admin users
  if (forceRequested && !isAdmin) {
    const err = apiError(
      "FORBIDDEN",
      "force=true is only allowed for admin users",
      403,
      { actor, hint: "Only users in ADMIN_USERS env can use force" }
    );
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Check if claim columns exist (migration 010) and claim_role (migration 015)
    const existingColumns = await getVideosColumns();
    const hasClaimColumns = existingColumns.has("claimed_by") && existingColumns.has("claim_expires_at");
    const hasClaimRoleColumn = existingColumns.has("claim_role");

    if (!hasClaimColumns) {
      const { data: video, error: fetchError } = await supabaseAdmin
        .from("videos")
        .select("id")
        .eq("id", id)
        .single();

      if (fetchError || !video) {
        const err = apiError("NOT_FOUND", "Video not found", 404, { video_id: id });
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }

      const existingClaim = getMemoryClaim(id);
      if (existingClaim && !(forceRequested && isAdmin) && existingClaim.claimed_by !== actor) {
        const err = apiError("NOT_CLAIM_OWNER", `Video is claimed by ${existingClaim.claimed_by}, not ${actor}`, 403, {
          current_claimed_by: existingClaim.claimed_by,
          actor,
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

    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id,claimed_by")
      .eq("id", id)
      .single();

    if (fetchError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404, { video_id: id });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    if (!(forceRequested && isAdmin) && video.claimed_by !== actor) {
      const err = apiError("NOT_CLAIM_OWNER", `Video is claimed by ${video.claimed_by}, not ${actor}`, 403, {
        current_claimed_by: video.claimed_by,
        actor,
      });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Build update payload - only include claim_role if column exists
    const updatePayload: Record<string, unknown> = {
      claimed_by: null,
      claimed_at: null,
      claim_expires_at: null,
    };
    if (hasClaimRoleColumn) {
      updatePayload.claim_role = null;
    }

    // Release the claim
    let query = supabaseAdmin
      .from("videos")
      .update(updatePayload)
      .eq("id", id);

    // If not forcing (or not admin), also require claimed_by match
    if (!(forceRequested && isAdmin)) {
      query = query.eq("claimed_by", actor);
    }

    const selectCols = hasClaimRoleColumn ? VIDEO_SELECT_BASE + VIDEO_SELECT_ROLE : VIDEO_SELECT_BASE;

    const { data: updated, error: updateError } = await query
      .select(selectCols)
      .single();

    if (updateError || !updated) {
      const err = apiError("BAD_REQUEST", "Failed to release claim", 409, { video_id: id });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write audit event
    await writeVideoEvent(id, "release", correlationId, actor, {
      released_by: actor,
      force: forceRequested && isAdmin,
    });

    return NextResponse.json({ ok: true, data: updated, correlation_id: correlationId });

  } catch (err) {
    console.error("POST /api/videos/[id]/release error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
