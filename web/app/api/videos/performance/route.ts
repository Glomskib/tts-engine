import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * GET /api/videos/performance — list all posted videos with performance data
 * Query params: account_id, days, min_engagement, sort, limit
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const params = request.nextUrl.searchParams;
    const accountId = params.get('account_id');
    const days = parseInt(params.get('days') || '30', 10);
    const minEngagement = parseFloat(params.get('min_engagement') || '0');
    const sort = params.get('sort') || 'created_at';
    const order = params.get('order') || 'desc';
    const limit = Math.min(parseInt(params.get('limit') || '100', 10), 500);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    let query = supabaseAdmin
      .from('videos')
      .select(`
        id, video_code, product_id, recording_status, account_id,
        tiktok_url, tiktok_views, tiktok_likes, tiktok_comments,
        tiktok_shares, tiktok_saves, tiktok_sales, tiktok_revenue,
        tiktok_clicks, stats_updated_at, is_winner, winner_score,
        winner_confidence, winner_reasons, created_at,
        last_status_changed_at, scheduled_date,
        product:product_id(id, name, brand),
        account:account_id(id, name, handle)
      `)
      .in('recording_status', ['POSTED', 'LIVE'])
      .gte('created_at', cutoff.toISOString())
      .limit(limit);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    // Sort
    const validSorts: Record<string, string> = {
      created_at: 'created_at',
      views: 'tiktok_views',
      likes: 'tiktok_likes',
      revenue: 'tiktok_revenue',
      engagement: 'tiktok_views', // we'll sort client-side for engagement
    };
    const sortCol = validSorts[sort] || 'created_at';
    query = query.order(sortCol, { ascending: order === 'asc' });

    const { data: videos, error } = await query;

    if (error) {
      console.error(`[${correlationId}] Performance fetch error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to fetch performance data', 500, correlationId);
    }

    // Compute engagement rate and apply filter
    const enriched = (videos || []).map((v: any) => {
      const views = v.tiktok_views || 0;
      const likes = v.tiktok_likes || 0;
      const comments = v.tiktok_comments || 0;
      const shares = v.tiktok_shares || 0;
      const engagement_rate = views > 0
        ? Math.round(((likes + comments + shares) / views) * 10000) / 100
        : 0;
      const revenue = v.tiktok_revenue || 0;

      // Performance tier
      let tier: 'outperforming' | 'average' | 'underperforming' = 'average';
      if (engagement_rate >= 5 || views >= 10000) tier = 'outperforming';
      else if (views > 0 && engagement_rate < 2) tier = 'underperforming';

      return {
        id: v.id,
        video_code: v.video_code,
        product: v.product ? { id: v.product.id, name: v.product.name, brand: v.product.brand } : null,
        account: v.account ? { id: v.account.id, name: v.account.name, handle: v.account.handle } : null,
        tiktok_url: v.tiktok_url,
        posted_date: v.last_status_changed_at || v.created_at,
        views,
        likes,
        comments,
        shares: shares,
        saves: v.tiktok_saves || 0,
        sales: v.tiktok_sales || 0,
        revenue,
        clicks: v.tiktok_clicks || 0,
        engagement_rate,
        tier,
        is_winner: v.is_winner || false,
        winner_score: v.winner_score,
        winner_confidence: v.winner_confidence,
        stats_updated_at: v.stats_updated_at,
      };
    }).filter((v: any) => v.engagement_rate >= minEngagement);

    // Summary stats
    const totalViews = enriched.reduce((s: number, v: any) => s + v.views, 0);
    const totalRevenue = enriched.reduce((s: number, v: any) => s + v.revenue, 0);
    const avgEngagement = enriched.length > 0
      ? Math.round(enriched.reduce((s: number, v: any) => s + v.engagement_rate, 0) / enriched.length * 100) / 100
      : 0;

    return NextResponse.json({
      ok: true,
      data: {
        videos: enriched,
        summary: {
          total: enriched.length,
          total_views: totalViews,
          total_revenue: totalRevenue,
          avg_engagement: avgEngagement,
          outperforming: enriched.filter((v: any) => v.tier === 'outperforming').length,
          underperforming: enriched.filter((v: any) => v.tier === 'underperforming').length,
        },
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Performance list error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}
