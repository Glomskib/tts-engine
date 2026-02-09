import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { detectWinner } from "@/lib/winner-detection";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check — admin only
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  // Get all posted videos with TikTok stats that haven't been marked as winners
  const { data: videos, error } = await supabaseAdmin
    .from("videos")
    .select(
      "id, title, product_id, tiktok_views, tiktok_likes, tiktok_comments, tiktok_shares, tiktok_saves, tiktok_sales, tiktok_revenue, tiktok_clicks, is_winner, winner_detected_at, created_at"
    )
    .gt("tiktok_views", 0);

  if (error) {
    console.error(
      `[${correlationId}] POST /api/videos/detect-winners error:`,
      error
    );
    const err = apiError("DB_ERROR", error.message, 500);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  const results = {
    evaluated: 0,
    new_winners: 0,
    already_winners: 0,
    winners: [] as Array<{
      id: string;
      title: string | null;
      is_winner: boolean;
      confidence: string;
      score: number;
      reasons: string[];
      recommendation: string;
      is_new: boolean;
    }>,
  };

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

        // Mark as winner in DB
        await supabaseAdmin
          .from("videos")
          .update({
            is_winner: true,
            winner_detected_at: new Date().toISOString(),
            winner_confidence: result.confidence,
            winner_score: result.score,
            winner_reasons: result.reasons,
          })
          .eq("id", video.id);
      } else {
        results.already_winners++;

        // Update score/reasons if they've changed
        await supabaseAdmin
          .from("videos")
          .update({
            winner_confidence: result.confidence,
            winner_score: result.score,
            winner_reasons: result.reasons,
          })
          .eq("id", video.id);
      }

      results.winners.push({
        id: video.id,
        title: video.title,
        is_winner: true,
        confidence: result.confidence,
        score: result.score,
        reasons: result.reasons,
        recommendation: result.recommendation,
        is_new: isNew,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ...results,
    correlation_id: correlationId,
  });
}
