import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * POST /api/analytics/daily-summary
 * Generate (or regenerate) a daily analytics summary for the authenticated user.
 *
 * Body: { date?: string }  — YYYY-MM-DD, defaults to today
 *
 * Compiles videos created, videos posted, total views, best performing video,
 * pipeline health breakdown, and brand breakdown for the given date,
 * then upserts into daily_summaries.
 */
export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
    }

    // Parse optional date from body (default to today YYYY-MM-DD)
    let targetDate: string;
    try {
      const body = await request.json().catch(() => ({}));
      targetDate = body.date || new Date().toISOString().slice(0, 10);
    } catch {
      targetDate = new Date().toISOString().slice(0, 10);
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return createApiErrorResponse("BAD_REQUEST", "Invalid date format. Use YYYY-MM-DD.", 400, correlationId);
    }

    const dayStart = `${targetDate}T00:00:00.000Z`;
    const dayEnd = `${targetDate}T23:59:59.999Z`;

    // Run all queries in parallel
    const [
      createdResult,
      postedResult,
      totalViewsResult,
      bestVideoResult,
      pipelineResult,
      brandResult,
    ] = await Promise.all([
      // a. Videos created today
      supabaseAdmin
        .from("videos")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd),

      // b. Videos posted today (status = POSTED, last_status_changed_at on this date)
      supabaseAdmin
        .from("videos")
        .select("id", { count: "exact", head: true })
        .eq("status", "POSTED")
        .gte("last_status_changed_at", dayStart)
        .lte("last_status_changed_at", dayEnd),

      // c. Total views across all videos (sum tiktok_views)
      supabaseAdmin
        .from("videos")
        .select("tiktok_views"),

      // d. Best performing video (highest tiktok_views, posted in last 30 days)
      supabaseAdmin
        .from("videos")
        .select("id, title, tiktok_views, tiktok_likes, tiktok_comments, tiktok_shares, tiktok_url, product:product_id(id,name,brand)")
        .not("tiktok_views", "is", null)
        .gt("tiktok_views", 0)
        .gte("last_status_changed_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order("tiktok_views", { ascending: false })
        .limit(1),

      // e. Pipeline health: count videos grouped by status
      supabaseAdmin
        .from("videos")
        .select("status, recording_status"),

      // f. Brand breakdown for the date
      supabaseAdmin
        .from("videos")
        .select("product:product_id(id,name,brand)")
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd),
    ]);

    // Process results

    // a. Videos created
    const videosCreated = createdResult.count ?? 0;

    // b. Videos posted
    const videosPosted = postedResult.count ?? 0;

    // c. Total views
    let totalViews = 0;
    if (totalViewsResult.data) {
      for (const v of totalViewsResult.data) {
        totalViews += v.tiktok_views || 0;
      }
    }

    // d. Best performing video
    let bestVideoId: string | null = null;
    let bestVideo: Record<string, unknown> | null = null;
    if (bestVideoResult.data && bestVideoResult.data.length > 0) {
      const bv = bestVideoResult.data[0];
      const product = bv.product as { id: string; name: string; brand: string } | null;
      bestVideoId = bv.id;
      bestVideo = {
        id: bv.id,
        title: bv.title,
        views: bv.tiktok_views || 0,
        likes: bv.tiktok_likes || 0,
        comments: bv.tiktok_comments || 0,
        shares: bv.tiktok_shares || 0,
        tiktok_url: bv.tiktok_url,
        product_name: product?.name || null,
        product_brand: product?.brand || null,
      };
    }

    // e. Pipeline health — group by status
    const pipelineHealth: Record<string, number> = {};
    if (pipelineResult.data) {
      for (const v of pipelineResult.data) {
        const status = v.recording_status || v.status || "unknown";
        pipelineHealth[status] = (pipelineHealth[status] || 0) + 1;
      }
    }

    // f. Brand breakdown
    const brandBreakdown: Record<string, number> = {};
    if (brandResult.data) {
      for (const v of brandResult.data) {
        const product = v.product as { id: string; name: string; brand: string } | null;
        const brand = product?.brand || "Unbranded";
        brandBreakdown[brand] = (brandBreakdown[brand] || 0) + 1;
      }
    }

    // Assemble the JSONB data payload
    const summaryData = {
      videos_created: videosCreated,
      videos_posted: videosPosted,
      total_views: totalViews,
      best_video: bestVideo,
      pipeline_health: pipelineHealth,
      brand_breakdown: brandBreakdown,
      generated_at: new Date().toISOString(),
    };

    // Upsert into daily_summaries (ON CONFLICT user_id, summary_date)
    const { data: upserted, error: upsertError } = await supabaseAdmin
      .from("daily_summaries")
      .upsert(
        {
          user_id: user.id,
          summary_date: targetDate,
          data: summaryData,
          videos_created: videosCreated,
          videos_posted: videosPosted,
          total_views: totalViews,
          best_video_id: bestVideoId,
          pipeline_health: pipelineHealth,
        },
        { onConflict: "user_id,summary_date" }
      )
      .select()
      .single();

    if (upsertError) {
      console.error(`[${correlationId}] daily-summary upsert error:`, upsertError);
      return createApiErrorResponse("DB_ERROR", "Failed to save daily summary", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data: upserted,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (err) {
    console.error(`[${correlationId}] daily-summary POST error:`, err);
    return createApiErrorResponse("INTERNAL", "Failed to generate daily summary", 500, correlationId);
  }
}

/**
 * GET /api/analytics/daily-summary
 * Fetch historical daily summaries for the authenticated user.
 *
 * Query params:
 *   days — number of days of history to return (default 30, max 365)
 */
export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(
      Math.max(parseInt(searchParams.get("days") || "30", 10) || 30, 1),
      365
    );

    const { data: summaries, error } = await supabaseAdmin
      .from("daily_summaries")
      .select("*")
      .eq("user_id", user.id)
      .order("summary_date", { ascending: false })
      .limit(days);

    if (error) {
      console.error(`[${correlationId}] daily-summary GET error:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch daily summaries", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data: summaries || [],
      days,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (err) {
    console.error(`[${correlationId}] daily-summary GET error:`, err);
    return createApiErrorResponse("INTERNAL", "Failed to fetch daily summaries", 500, correlationId);
  }
}
