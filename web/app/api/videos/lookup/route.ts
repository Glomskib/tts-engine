import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const tiktokUrl = searchParams.get("tiktok_url");
  const title = searchParams.get("title");
  const postedUrl = searchParams.get("posted_url");

  if (!tiktokUrl && !title && !postedUrl) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Provide tiktok_url, posted_url, or title query parameter",
      400
    , correlationId);
  }

  let query = supabaseAdmin
    .from("videos")
    .select(
      "id, video_code, tiktok_url, posted_url, posted_platform, recording_status, product_id, tiktok_views, tiktok_likes, tiktok_comments, tiktok_shares, is_winner, stats_updated_at"
    );

  if (tiktokUrl) {
    query = query.eq("tiktok_url", tiktokUrl);
  } else if (postedUrl) {
    query = query.eq("posted_url", postedUrl);
  } else if (title) {
    query = query.ilike("video_code", `%${title}%`);
  }

  const { data, error } = await query.limit(20);

  if (error) {
    console.error(`[${correlationId}] GET /api/videos/lookup error:`, error);
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: data || [],
    count: data?.length || 0,
    correlation_id: correlationId,
  });
}
