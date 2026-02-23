import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * GET /api/products/performance
 * Returns aggregated video performance metrics grouped by product.
 *
 * Query params:
 *   period — 7d | 30d | 90d | all (default: 30d)
 *   sort   — views | engagement | videos (default: views)
 *   limit  — max results (default: 20)
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const userId = authContext.user.id;
  const params = request.nextUrl.searchParams;
  const period = params.get('period') || '30d';
  const sort = params.get('sort') || 'views';
  const limit = Math.min(parseInt(params.get('limit') || '20', 10) || 20, 100);

  try {
    // Period filter
    let periodStart: number | null = null;
    const nowSec = Math.floor(Date.now() / 1000);
    switch (period) {
      case '7d':  periodStart = nowSec - 7 * 86400; break;
      case '30d': periodStart = nowSec - 30 * 86400; break;
      case '90d': periodStart = nowSec - 90 * 86400; break;
      case 'all': default: periodStart = null;
    }

    // Fetch all tiktok_videos with a product_id
    let query = supabaseAdmin
      .from('tiktok_videos')
      .select('tiktok_video_id, title, view_count, like_count, comment_count, share_count, product_id, create_time, comment_sentiment_summary')
      .eq('user_id', userId)
      .not('product_id', 'is', null);

    if (periodStart) {
      query = query.gte('create_time', periodStart);
    }

    const { data: videos, error: vErr } = await query;
    if (vErr) throw vErr;

    // Fetch products for name/brand
    const { data: products, error: pErr } = await supabaseAdmin
      .from('products')
      .select('id, name, brand')
      .eq('user_id', userId);
    if (pErr) throw pErr;

    const productMap = new Map<string, { name: string; brand: string | null }>();
    for (const p of products || []) {
      productMap.set(p.id, { name: p.name, brand: p.brand });
    }

    // Group videos by product_id
    const groups = new Map<string, typeof videos>();
    for (const v of videos || []) {
      const pid = v.product_id as string;
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid)!.push(v);
    }

    // Build aggregated response
    const productRows = Array.from(groups.entries()).map(([productId, vids]) => {
      const info = productMap.get(productId);
      let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
      let topVideo: { tiktok_video_id: string; title: string | null; view_count: number } | null = null;
      let sentimentAgg = { positive: 0, negative: 0, neutral: 0 };

      for (const v of vids) {
        const views = Number(v.view_count) || 0;
        const likes = Number(v.like_count) || 0;
        const comments = Number(v.comment_count) || 0;
        const shares = Number(v.share_count) || 0;
        totalViews += views;
        totalLikes += likes;
        totalComments += comments;
        totalShares += shares;

        if (!topVideo || views > topVideo.view_count) {
          topVideo = { tiktok_video_id: v.tiktok_video_id, title: v.title, view_count: views };
        }

        // Aggregate sentiment from cached summaries
        const ss = v.comment_sentiment_summary as { positive?: number; negative?: number; neutral?: number } | null;
        if (ss) {
          sentimentAgg.positive += ss.positive || 0;
          sentimentAgg.negative += ss.negative || 0;
          sentimentAgg.neutral += ss.neutral || 0;
        }
      }

      const totalEngagements = totalLikes + totalComments + totalShares;
      const avgEngagementRate = totalViews > 0
        ? parseFloat((totalEngagements / totalViews * 100).toFixed(2))
        : 0;

      return {
        product_id: productId,
        product_name: info?.name || 'Unknown',
        brand: info?.brand || null,
        video_count: vids.length,
        total_views: totalViews,
        total_likes: totalLikes,
        total_comments: totalComments,
        total_shares: totalShares,
        avg_engagement_rate: avgEngagementRate,
        top_video: topVideo,
        comment_sentiment: sentimentAgg,
      };
    });

    // Sort
    switch (sort) {
      case 'engagement': productRows.sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate); break;
      case 'videos':     productRows.sort((a, b) => b.video_count - a.video_count); break;
      case 'views': default: productRows.sort((a, b) => b.total_views - a.total_views);
    }

    const response = NextResponse.json({
      ok: true,
      data: { products: productRows.slice(0, limit) },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;

  } catch (err: any) {
    console.error(`[${correlationId}] /api/products/performance error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch product performance', 500, correlationId);
  }
}
