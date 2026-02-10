import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { apiError, generateCorrelationId, isAdminUser } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

const VALID_CLAIM_ROLES = ["recorder", "editor", "uploader", "admin"] as const;
type ClaimRole = typeof VALID_CLAIM_ROLES[number];

const VIDEO_SELECT_BASE = "id,variant_id,account_id,status,google_drive_url,created_at,claimed_by,claimed_at,claim_expires_at,claim_role,recording_status";

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

async function insertNotification(
  userId: string,
  type: string,
  videoId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type,
      video_id: videoId,
      payload,
    });
  } catch (err) {
    console.error("Failed to insert notification:", err);
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

  const idUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!idUuidRegex.test(id)) {
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

  const { from_user, to_user, to_user_id, to_role, ttl_minutes, force, notes } = body as Record<string, unknown>;

  // Get authentication context from session
  const authContext = await getApiAuthContext(request);

  // Determine actor (from_user): prefer authenticated user, fallback to legacy for tests
  const isAuthenticated = authContext.user !== null;
  const actor = authContext.user
    ? authContext.user.id
    : (typeof from_user === "string" && from_user.trim() !== "" ? from_user.trim() : null);

  if (!actor) {
    const err = apiError(
      "MISSING_ACTOR",
      "Authentication required. Please sign in to handoff videos.",
      401,
      { hint: "Sign in or provide from_user in request body for test mode" }
    );
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate to_user_id (preferred when authenticated) or to_user (legacy)
  const hasToUserId = typeof to_user_id === "string" && idUuidRegex.test(to_user_id);
  const hasToUser = typeof to_user === "string" && to_user.trim() !== "";

  if (!hasToUserId && !hasToUser) {
    const err = apiError("BAD_REQUEST", "to_user_id (UUID) or to_user (string) is required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Use to_user_id if provided, otherwise fall back to to_user
  const targetUserId = hasToUserId ? (to_user_id as string) : null;
  const targetUserLabel = hasToUser ? (to_user as string).trim() : (to_user_id as string);

  // Validate to_role
  if (!VALID_CLAIM_ROLES.includes(to_role as ClaimRole)) {
    const err = apiError("INVALID_ROLE", `to_role must be one of: ${VALID_CLAIM_ROLES.join(", ")}`, 400, { provided: to_role });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const ttl = typeof ttl_minutes === "number" && ttl_minutes > 0 ? ttl_minutes : 120;
  const forceRequested = force === true;
  // Admin check: prefer authenticated role, fallback to legacy ADMIN_USERS check for tests
  const isAdmin = isAuthenticated ? authContext.isAdmin : isAdminUser(actor);

  // Force is only allowed for admin users
  if (forceRequested && !isAdmin) {
    const err = apiError(
      "FORBIDDEN",
      "force=true is only allowed for admin users",
      403,
      { from_user: actor, hint: "Only authenticated admin users can use force" }
    );
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Check if claim columns exist (migration 010 + 015)
    const existingColumns = await getVideosColumns();
    const hasClaimColumns = existingColumns.has("claimed_by") && existingColumns.has("claim_expires_at") && existingColumns.has("claim_role");
    const hasAssignmentColumns = existingColumns.has("assigned_to") && existingColumns.has("assigned_at");

    if (!hasClaimColumns) {
      const err = apiError("BAD_REQUEST", "Handoff requires claim columns (migrations 010 and 015)", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Build dynamic select
    let selectCols = VIDEO_SELECT_BASE;
    if (hasAssignmentColumns) {
      selectCols += ",assigned_to";
    }

    // Fetch current video
    const { data: videoData, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select(selectCols)
      .eq("id", id)
      .single();

    if (fetchError || !videoData) {
      const err = apiError("NOT_FOUND", "Video not found", 404, { video_id: id });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const video = videoData as unknown as Record<string, unknown>;

    const now = new Date().toISOString();

    // Validate current claim belongs to from_user (unless force)
    const hasValidClaim =
      typeof video.claimed_by === "string" &&
      video.claimed_by.trim() !== "" &&
      video.claim_expires_at &&
      video.claim_expires_at > now;

    // Admin with force can bypass ownership checks
    if (!(forceRequested && isAdmin)) {
      if (!hasValidClaim) {
        const err = apiError("NOT_CLAIMED", "Video is not currently claimed", 409, {
          claimed_by: video.claimed_by || null,
          claim_expires_at: video.claim_expires_at || null,
        });
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }

      if (video.claimed_by !== actor) {
        const err = apiError("NOT_CLAIM_OWNER", "You do not have a claim on this video", 403);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
    }

    // Perform handoff: transfer claim to new user with new role
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      claimed_by: targetUserLabel,
      claimed_at: now,
      claim_expires_at: expiresAt,
      claim_role: to_role,
    };

    // If we have assignment columns and a valid user ID, also set assigned_to
    if (hasAssignmentColumns && targetUserId) {
      updatePayload.assigned_to = targetUserId;
      updatePayload.assigned_at = now;
      updatePayload.assigned_by = actor;
    }

    const { data: updatedData, error: updateError } = await supabaseAdmin
      .from("videos")
      .update(updatePayload)
      .eq("id", id)
      .select(selectCols)
      .single();

    if (updateError || !updatedData) {
      const err = apiError("DB_ERROR", "Failed to perform handoff", 500, { video_id: id });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const updated = updatedData as unknown as Record<string, unknown>;

    // Write audit event
    await writeVideoEvent(id, "handoff", correlationId, actor, {
      from_user: actor,
      from_role: (video.claim_role as string) || null,
      to_user: targetUserLabel,
      to_user_id: targetUserId,
      to_role,
      ttl_minutes: ttl,
      force: forceRequested && isAdmin,
      authenticated: isAuthenticated,
      notes: typeof notes === "string" ? notes : null,
    });

    // Insert notification for recipient if we have their user ID
    if (targetUserId) {
      await insertNotification(targetUserId, "handoff", id, {
        from: authContext.user?.email || actor,
        to_role,
        notes: typeof notes === "string" ? notes : null,
      });
    }

    return NextResponse.json({
      ok: true,
      data: updated,
      meta: {
        from_user: actor,
        from_role: (video.claim_role as string) || null,
        to_user: targetUserLabel,
        to_user_id: targetUserId,
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
