import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_TTL_MINUTES = 60;

function getTtlMinutes(): number {
  const envVal = process.env.VIDEO_CLAIM_TTL_MINUTES;
  if (!envVal) return DEFAULT_TTL_MINUTES;
  const parsed = parseInt(envVal, 10);
  if (isNaN(parsed) || parsed < 1) return DEFAULT_TTL_MINUTES;
  return parsed;
}

function isAdminAllowed(): boolean {
  const isProduction = process.env.NODE_ENV === "production";
  const adminEnabled = process.env.ADMIN_UI_ENABLED === "true";
  return !isProduction || adminEnabled;
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

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Guard: only allowed if admin is enabled
  if (!isAdminAllowed()) {
    const err = apiError("NOT_FOUND", "Not found", 404);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const ttlMinutes = getTtlMinutes();
    const cutoffTime = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

    // Find stale claims: claimed_by is not null AND claimed_at < cutoff
    const { data: staleVideos, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id,claimed_by,claimed_at")
      .not("claimed_by", "is", null)
      .not("claimed_at", "is", null)
      .lt("claimed_at", cutoffTime);

    if (fetchError) {
      // If columns don't exist, return gracefully
      if (fetchError.message?.includes("claimed_by") || fetchError.message?.includes("claimed_at")) {
        return NextResponse.json({
          ok: true,
          released_count: 0,
          message: "Claim columns not yet migrated",
          correlation_id: correlationId,
        });
      }
      console.error("POST /api/videos/release-stale fetch error:", fetchError);
      const err = apiError("DB_ERROR", fetchError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    if (!staleVideos || staleVideos.length === 0) {
      return NextResponse.json({
        ok: true,
        released_count: 0,
        ttl_minutes: ttlMinutes,
        cutoff_time: cutoffTime,
        correlation_id: correlationId,
      });
    }

    const staleIds = staleVideos.map((v) => v.id);

    // Release all stale claims in one update
    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update({
        claimed_by: null,
        claimed_at: null,
        claim_expires_at: null,
      })
      .in("id", staleIds);

    if (updateError) {
      console.error("POST /api/videos/release-stale update error:", updateError);
      const err = apiError("DB_ERROR", updateError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write audit events for each released video
    for (const video of staleVideos) {
      await writeVideoEvent(video.id, "stale_release", correlationId, "system", {
        previous_claimed_by: video.claimed_by,
        previous_claimed_at: video.claimed_at,
        ttl_minutes: ttlMinutes,
        cutoff_time: cutoffTime,
      });
    }

    return NextResponse.json({
      ok: true,
      released_count: staleVideos.length,
      released_ids: staleIds,
      ttl_minutes: ttlMinutes,
      cutoff_time: cutoffTime,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/videos/release-stale error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
