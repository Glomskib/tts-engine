import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * GET /api/revenue — revenue analytics with breakdowns
 * ?days=30&group_by=product|account|content_type
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const params = request.nextUrl.searchParams;
    const days = parseInt(params.get('days') || '30', 10);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // Fetch all posted videos with revenue data
    const { data: videos, error } = await supabaseAdmin
      .from('videos')
      .select(`
        id, video_code, recording_status, created_at, last_status_changed_at,
        tiktok_views, tiktok_likes, tiktok_comments, tiktok_shares,
        tiktok_revenue, tiktok_sales, tiktok_clicks,
        actual_revenue, estimated_revenue, production_cost,
        account_id, product_id,
        product:product_id(id, name, brand, category),
        account:account_id(id, name, handle, type)
      `)
      .in('recording_status', ['POSTED', 'LIVE'])
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`[${correlationId}] Revenue fetch error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to fetch revenue data', 500, correlationId);
    }

    const allVideos = (videos || []) as any[];

    // Calculate totals
    let totalRevenue = 0;
    let totalCost = 0;
    let totalViews = 0;

    // Group by product
    const byProduct: Record<string, { name: string; brand: string; revenue: number; cost: number; videos: number; views: number }> = {};
    // Group by account
    const byAccount: Record<string, { name: string; handle: string; revenue: number; cost: number; videos: number; views: number }> = {};
    // Daily revenue timeline
    const dailyRevenue: Record<string, { date: string; revenue: number; cost: number; videos: number }> = {};

    for (const v of allVideos) {
      const revenue = (v.tiktok_revenue || 0) + (v.actual_revenue || 0);
      const cost = v.production_cost || 0;
      const views = v.tiktok_views || 0;

      totalRevenue += revenue;
      totalCost += cost;
      totalViews += views;

      // Product grouping
      const prodKey = v.product?.id || 'unknown';
      if (!byProduct[prodKey]) {
        byProduct[prodKey] = { name: v.product?.name || 'Unknown', brand: v.product?.brand || '', revenue: 0, cost: 0, videos: 0, views: 0 };
      }
      byProduct[prodKey].revenue += revenue;
      byProduct[prodKey].cost += cost;
      byProduct[prodKey].videos++;
      byProduct[prodKey].views += views;

      // Account grouping
      const acctKey = v.account?.id || 'unassigned';
      if (!byAccount[acctKey]) {
        byAccount[acctKey] = { name: v.account?.name || 'Unassigned', handle: v.account?.handle || '', revenue: 0, cost: 0, videos: 0, views: 0 };
      }
      byAccount[acctKey].revenue += revenue;
      byAccount[acctKey].cost += cost;
      byAccount[acctKey].videos++;
      byAccount[acctKey].views += views;

      // Daily timeline
      const date = (v.last_status_changed_at || v.created_at || '').slice(0, 10);
      if (date) {
        if (!dailyRevenue[date]) dailyRevenue[date] = { date, revenue: 0, cost: 0, videos: 0 };
        dailyRevenue[date].revenue += revenue;
        dailyRevenue[date].cost += cost;
        dailyRevenue[date].videos++;
      }
    }

    // Sort by revenue
    const productBreakdown = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue);
    const accountBreakdown = Object.values(byAccount).sort((a, b) => b.revenue - a.revenue);
    const timeline = Object.values(dailyRevenue).sort((a, b) => a.date.localeCompare(b.date));

    // Top 5 individual videos by revenue
    const topVideos = allVideos
      .map(v => ({
        id: v.id,
        video_code: v.video_code,
        product_name: v.product?.name || 'Unknown',
        account_name: v.account?.name || '-',
        revenue: (v.tiktok_revenue || 0) + (v.actual_revenue || 0),
        cost: v.production_cost || 0,
        roi: v.production_cost > 0
          ? Math.round((((v.tiktok_revenue || 0) + (v.actual_revenue || 0) - v.production_cost) / v.production_cost) * 100)
          : 0,
        views: v.tiktok_views || 0,
      }))
      .sort((a: any, b: any) => b.revenue - a.revenue)
      .slice(0, 10);

    const totalROI = totalCost > 0 ? Math.round(((totalRevenue - totalCost) / totalCost) * 100) : 0;

    return NextResponse.json({
      ok: true,
      data: {
        summary: {
          total_revenue: Math.round(totalRevenue * 100) / 100,
          total_cost: Math.round(totalCost * 100) / 100,
          total_profit: Math.round((totalRevenue - totalCost) * 100) / 100,
          roi_percent: totalROI,
          total_views: totalViews,
          total_videos: allVideos.length,
          revenue_per_video: allVideos.length > 0 ? Math.round((totalRevenue / allVideos.length) * 100) / 100 : 0,
        },
        by_product: productBreakdown,
        by_account: accountBreakdown,
        timeline,
        top_videos: topVideos,
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Revenue error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}
