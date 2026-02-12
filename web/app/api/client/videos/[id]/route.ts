import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getPrimaryClientOrgForUser, isVideoInUserOrg } from "@/lib/client-org";

export const runtime = "nodejs";

// Client-safe fields only
const CLIENT_SAFE_SELECT = "id,status,recording_status,created_at,last_status_changed_at,posted_url,posted_platform,script_locked_text";

// Client-safe event types (no admin actions)
const CLIENT_SAFE_EVENT_TYPES = ["recording_status_changed"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id: videoId } = await params;

  // Require authentication
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Validate video ID format
  if (!videoId || !videoId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return createApiErrorResponse("BAD_REQUEST", "Invalid video ID format", 400, correlationId);
  }

  // Get user's primary organization
  const membership = await getPrimaryClientOrgForUser(supabaseAdmin, authContext.user.id);
  if (!membership) {
    return NextResponse.json({
      ok: false,
      error: "client_org_required",
      message: "Your portal is not yet connected to an organization. Contact support.",
      correlation_id: correlationId,
    }, { status: 403 });
  }

  // Check if video belongs to user's organization
  const videoInOrg = await isVideoInUserOrg(supabaseAdmin, authContext.user.id, videoId);
  if (!videoInOrg) {
    // Return 404 to avoid information leakage about video existence
    return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
  }

  try {
    // Fetch video
    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select(CLIENT_SAFE_SELECT)
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
    }

    // Fetch timeline events (client-safe types only, no actor info)
    const { data: events, error: eventsError } = await supabaseAdmin
      .from("video_events")
      .select("id,type,created_at,from_status,to_status")
      .eq("video_id", videoId)
      .in("type", CLIENT_SAFE_EVENT_TYPES)
      .order("created_at", { ascending: false })
      .limit(50);

    if (eventsError) {
      console.error("[client/videos/[id]] Events query error:", eventsError);
      // Continue without events if table doesn't exist
    }

    // Map to client-safe shapes
    const clientVideo = {
      id: video.id,
      status: video.status,
      recording_status: video.recording_status || "NOT_RECORDED",
      created_at: video.created_at,
      last_status_changed_at: video.last_status_changed_at,
      posted_url: video.posted_url,
      posted_platform: video.posted_platform,
      script_locked_text: video.script_locked_text || null,
    };

    const timeline = (events || []).map((e) => ({
      id: e.id,
      type: e.type,
      created_at: e.created_at,
      from_status: e.from_status,
      to_status: e.to_status,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        video: clientVideo,
        timeline,
      },
    });
  } catch (err) {
    console.error("[client/videos/[id]] Unexpected error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
