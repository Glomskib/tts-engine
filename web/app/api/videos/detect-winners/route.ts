import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { detectWinner } from "@/lib/winner-detection";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check — admin only
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  // Get all posted videos with TikTok stats that haven't been marked as winners
  const { data: videos, error } = await supabaseAdmin
    .from("videos")
    .select(
      "id, video_code, product_id, tiktok_views, tiktok_likes, tiktok_comments, tiktok_shares, tiktok_saves, tiktok_sales, tiktok_revenue, tiktok_clicks, is_winner, winner_detected_at, created_at"
    )
    .gt("tiktok_views", 0);

  if (error) {
    console.error(
      `[${correlationId}] POST /api/videos/detect-winners error:`,
      error
    );
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  const results = {
    evaluated: 0,
    new_winners: 0,
    already_winners: 0,
    winners: [] as Array<{
      id: string;
      video_code: string | null;
      is_winner: boolean;
      confidence: string;
      score: number;
      reasons: string[];
      recommendation: string;
      is_new: boolean;
    }>,
  };

  // Evaluate all videos and collect DB updates
  const updatePromises: PromiseLike<unknown>[] = [];

  for (const video of videos || []) {
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

    const result = detectWinner(stats);
    results.evaluated++;

    if (result.is_winner) {
      const isNew = !video.is_winner;

      if (isNew) {
        results.new_winners++;
        updatePromises.push(
          supabaseAdmin
            .from("videos")
            .update({
              is_winner: true,
              winner_detected_at: new Date().toISOString(),
              winner_confidence: result.confidence,
              winner_score: result.score,
              winner_reasons: result.reasons,
            })
            .eq("id", video.id)
        );
      } else {
        results.already_winners++;
        updatePromises.push(
          supabaseAdmin
            .from("videos")
            .update({
              winner_confidence: result.confidence,
              winner_score: result.score,
              winner_reasons: result.reasons,
            })
            .eq("id", video.id)
        );
      }

      results.winners.push({
        id: video.id,
        video_code: video.video_code,
        is_winner: true,
        confidence: result.confidence,
        score: result.score,
        reasons: result.reasons,
        recommendation: result.recommendation,
        is_new: isNew,
      });
    }
  }

  // Execute all DB updates in parallel (batched)
  if (updatePromises.length > 0) {
    await Promise.all(updatePromises);
  }

  return NextResponse.json({
    ok: true,
    ...results,
    correlation_id: correlationId,
  });
}
