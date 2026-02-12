import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  // Generate or read correlation ID
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const { id } = await params;

  if (!id || typeof id !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "Video ID is required", 400, correlationId);
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return createApiErrorResponse("INVALID_UUID", "Video ID must be a valid UUID", 400, correlationId, { provided: id });
  }

  try {
    // Check if video exists
    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select("id")
      .eq("id", id)
      .single();

    if (videoError || !video) {
      return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId, { video_id: id });
    }

    // Fetch events for this video
    const { data: events, error: eventsError } = await supabaseAdmin
      .from("video_events")
      .select("id,event_type,from_status,to_status,correlation_id,actor,request_id,details,created_at")
      .eq("video_id", id)
      .order("created_at", { ascending: false });

    if (eventsError) {
      // If video_events table doesn't exist (migration 009 not applied), return empty array
      if (eventsError.message?.includes("video_events") && eventsError.message?.includes("schema cache")) {
        return NextResponse.json({
          ok: true,
          data: [],
          correlation_id: correlationId
        });
      }
      console.error("GET /api/videos/[id]/events Supabase error:", eventsError);
      return createApiErrorResponse("DB_ERROR", eventsError.message, 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: events || [],
      correlation_id: correlationId
    });

  } catch (err) {
    console.error("GET /api/videos/[id]/events error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
