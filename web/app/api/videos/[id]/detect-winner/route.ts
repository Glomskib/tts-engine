import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { detectWinner } from "@/lib/winner-detection";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Validate UUID
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Get video with product info
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("*, product:product_id(id, name, brand)")
    .eq("id", id)
    .single();

  if (videoError || !video) {
    return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
  }

  // Get product average for comparison
  let productAverage: { views: number; likes: number; comments: number; shares: number } | null = null;
  if (video.product_id) {
    const { data: productVideos } = await supabaseAdmin
      .from("videos")
      .select("tiktok_views, tiktok_likes, tiktok_comments, tiktok_shares")
      .eq("product_id", video.product_id)
      .gt("tiktok_views", 0);

    if (productVideos && productVideos.length > 1) {
      productAverage = {
        views:
          productVideos.reduce((sum, v) => sum + (v.tiktok_views || 0), 0) /
          productVideos.length,
        likes:
          productVideos.reduce((sum, v) => sum + (v.tiktok_likes || 0), 0) /
          productVideos.length,
        comments:
          productVideos.reduce(
            (sum, v) => sum + (v.tiktok_comments || 0),
            0
          ) / productVideos.length,
        shares:
          productVideos.reduce((sum, v) => sum + (v.tiktok_shares || 0), 0) /
          productVideos.length,
      };
    }
  }

  // Run detection
  const stats = {
    views: video.tiktok_views || 0,
    likes: video.tiktok_likes || 0,
    comments: video.tiktok_comments || 0,
    shares: video.tiktok_shares || 0,
    saves: video.tiktok_saves || 0,
    sales_count: video.tiktok_sales || 0,
    revenue: video.tiktok_revenue ? Number(video.tiktok_revenue) : 0,
    clicks: video.tiktok_clicks || 0,
    published_at: video.created_at,
  };

  const result = detectWinner(stats, productAverage);

  // If winner detected, update the video
  if (result.is_winner) {
    await supabaseAdmin
      .from("videos")
      .update({
        is_winner: true,
        winner_detected_at: new Date().toISOString(),
        winner_confidence: result.confidence,
        winner_score: result.score,
        winner_reasons: result.reasons,
      })
      .eq("id", id);
  }

  return NextResponse.json({
    ok: true,
    video_id: id,
    ...result,
    stats,
    product_average: productAverage,
    correlation_id: correlationId,
  });
}
