import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { triggerEmailNotification } from "@/lib/email-notifications";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ video_id: string }>;
}

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

/**
 * POST /api/admin/videos/[video_id]/clear-claim
 * Admin-only. Clear a stale claim without affecting assignment state.
 * Body: { reason: string }
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

  const { reason } = body as { reason?: string };

  // Validate reason
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    const err = apiError("BAD_REQUEST", "reason is required and must be non-empty", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Fetch current video
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id,claimed_by,claimed_at,claim_expires_at,claim_role")
      .eq("id", video_id)
      .single();

    if (fetchError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const previousClaimedBy = video.claimed_by;
    const previousClaimedAt = video.claimed_at;
    const previousClaimRole = video.claim_role;

    if (!previousClaimedBy) {
      return NextResponse.json({
        ok: true,
        data: video,
        message: "Video was not claimed",
        correlation_id: correlationId,
      });
    }

    // Clear the claim fields
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("videos")
      .update({
        claimed_by: null,
        claimed_at: null,
        claim_expires_at: null,
        claim_role: null,
      })
      .eq("id", video_id)
      .select("id,claimed_by,claimed_at,claim_expires_at,claim_role")
      .single();

    if (updateError) {
      console.error("Clear claim error:", updateError);
      const err = apiError("DB_ERROR", "Failed to clear claim", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Emit event
    await writeVideoEvent(video_id, "admin_clear_claim", correlationId, authContext.user.id, {
      cleared_by: authContext.user.email || authContext.user.id,
      reason: reason.trim(),
      previous_claimed_by: previousClaimedBy,
      previous_claimed_at: previousClaimedAt,
      previous_claim_role: previousClaimRole,
    });

    // Trigger email notification (fail-safe)
    triggerEmailNotification("admin_clear_claim", video_id, {
      adminUserId: authContext.user.id,
      performed_by: authContext.user.email || authContext.user.id,
      reason: reason.trim(),
      previous_claimed_by: previousClaimedBy,
    });

    return NextResponse.json({
      ok: true,
      data: updated,
      meta: {
        previous_claimed_by: previousClaimedBy,
        previous_claim_role: previousClaimRole,
        cleared_by: authContext.user.email || authContext.user.id,
        reason: reason.trim(),
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/admin/videos/[video_id]/clear-claim error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
