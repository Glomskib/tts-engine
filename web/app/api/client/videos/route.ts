import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

// Client-safe fields only - no internal notes, user IDs, or assignment data
const CLIENT_SAFE_SELECT = "id,status,recording_status,created_at,last_status_changed_at,posted_url,posted_platform";

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  // Require authentication
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Parse limit
  const limitParam = searchParams.get("limit");
  let limit = 50;
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, 100);
    }
  }

  try {
    const { data: videos, error } = await supabaseAdmin
      .from("videos")
      .select(CLIENT_SAFE_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[client/videos] Query error:", error);
      const err = apiError("DB_ERROR", "Failed to fetch videos", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Map to client-safe shape
    const clientVideos = (videos || []).map((v) => ({
      id: v.id,
      status: v.status,
      recording_status: v.recording_status || "NOT_RECORDED",
      created_at: v.created_at,
      last_status_changed_at: v.last_status_changed_at,
      posted_url: v.posted_url,
      posted_platform: v.posted_platform,
    }));

    return NextResponse.json({
      ok: true,
      data: clientVideos,
      meta: {
        count: clientVideos.length,
        limit,
      },
    });
  } catch (err) {
    console.error("[client/videos] Unexpected error:", err);
    const apiErr = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...apiErr.body, correlation_id: correlationId }, { status: apiErr.status });
  }
}
