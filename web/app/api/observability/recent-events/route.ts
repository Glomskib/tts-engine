import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { searchParams } = new URL(request.url);

  // Parse and validate limit
  const limitParam = searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1) {
      return createApiErrorResponse("BAD_REQUEST", "limit must be a positive integer", 400, correlationId, { provided: limitParam });
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("video_events")
      .select("id,video_id,event_type,from_status,to_status,correlation_id,actor,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      // If video_events table doesn't exist, return empty array gracefully
      if (error.message?.includes("video_events")) {
        return NextResponse.json({
          ok: true,
          data: [],
          message: "video_events table not yet migrated",
          correlation_id: correlationId,
        });
      }
      console.error("GET /api/observability/recent-events Supabase error:", error);
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/observability/recent-events error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
