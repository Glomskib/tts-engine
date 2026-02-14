import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getPrimaryClientOrgForUser, getOrgVideos } from '@/lib/client-org';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const membership = await getPrimaryClientOrgForUser(supabaseAdmin, authContext.user.id);
  if (!membership) {
    return NextResponse.json({
      ok: false,
      error: 'client_org_required',
      message: 'Your portal is not yet connected to an organization. Contact support.',
      correlation_id: correlationId,
    }, { status: 403 });
  }

  try {
    // Get org video IDs
    const videoIds = await getOrgVideos(supabaseAdmin, membership.org_id);

    if (videoIds.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          overview: { total_videos: 0, posted_videos: 0, total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0, total_gmv: 0, avg_engagement: 0 },
          videos: [],
          content_breakdown: [],
          posting_frequency: { this_month: 0, last_month: 0, posting_days_this_month: [] },
          month_over_month: { views_change_pct: 0, engagement_change_pct: 0, gmv_change_pct: 0 },
        },
        correlation_id: correlationId,
      });
    }

    // Fetch videos with product info
    const { data: videos } = await supabaseAdmin
      .from('videos')
      .select('id, status, recording_status, created_at, posted_url, posted_platform, product_id')
      .in('id', videoIds)
      .order('created_at', { ascending: false });

    const allVideos = videos || [];
    const postedVideoIds = allVideos
      .filter(v => ['POSTED', 'LIVE'].includes(v.recording_status || v.status || ''))
      .map(v => v.id);

    // Fetch TikTok video data for these videos (defensively — table may have no matches)
    let tiktokVideos: Array<{
      id: string;
      video_id: string | null;
      title: string | null;
      cover_image_url: string | null;
      view_count: number | null;
      like_count: number | null;
      comment_count: number | null;
      share_count: number | null;
      attributed_gmv: number | null;
      attributed_orders: number | null;
      content_tags: string[] | null;
      content_grade: string | null;
      create_time: number | null;
      share_url: string | null;
      duration: number | null;
    }> = [];

    try {
      // Match by video_id foreign key OR by user's tiktok videos
      if (videoIds.length > 0) {
        const { data: tkVids } = await supabaseAdmin
          .from('tiktok_videos')
          .select('id, video_id, title, cover_image_url, view_count, like_count, comment_count, share_count, attributed_gmv, attributed_orders, content_tags, content_grade, create_time, share_url, duration')
          .in('video_id', videoIds);
        if (tkVids) tiktokVideos = tkVids;
      }
    } catch {
      // tiktok_videos table may not exist or have no linked videos — continue
    }

    // Build a map of video_id -> tiktok data
    const tiktokMap = new Map<string, typeof tiktokVideos[number]>();
    for (const tk of tiktokVideos) {
      if (tk.video_id) tiktokMap.set(tk.video_id, tk);
    }

    // Fetch product names for display
    const productIds = [...new Set(allVideos.map(v => v.product_id).filter(Boolean))];
    let productMap = new Map<string, string>();
    if (productIds.length > 0) {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id, name')
        .in('id', productIds);
      if (products) {
        for (const p of products) productMap.set(p.id, p.name);
      }
    }

    // Build enhanced video list
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0, totalGmv = 0, totalOrders = 0;
    let thisMonthViews = 0, lastMonthViews = 0;
    let thisMonthEngNum = 0, thisMonthEngDenom = 0;
    let lastMonthEngNum = 0, lastMonthEngDenom = 0;
    let thisMonthGmv = 0, lastMonthGmv = 0;
    let thisMonthCount = 0, lastMonthCount = 0;
    const postingDaysThisMonth: string[] = [];
    const contentTypeMap = new Map<string, { count: number; views: number; gmv: number }>();

    const enhancedVideos: Array<{
      id: string;
      title: string;
      product_name: string | null;
      cover_image_url: string | null;
      views: number;
      likes: number;
      comments: number;
      shares: number;
      engagement_pct: number;
      gmv: number;
      orders: number;
      content_grade: string | null;
      content_tags: string[];
      posted_at: string;
      share_url: string | null;
      duration: number | null;
      status: string;
    }> = [];

    for (const v of allVideos) {
      const tk = tiktokMap.get(v.id);
      const views = tk?.view_count || 0;
      const likes = tk?.like_count || 0;
      const comments = tk?.comment_count || 0;
      const shares = tk?.share_count || 0;
      const gmv = Number(tk?.attributed_gmv || 0);
      const orders = tk?.attributed_orders || 0;
      const engPct = views > 0 ? Math.round(((likes + comments + shares) / views) * 10000) / 100 : 0;
      const tags = tk?.content_tags || [];

      totalViews += views;
      totalLikes += likes;
      totalComments += comments;
      totalShares += shares;
      totalGmv += gmv;
      totalOrders += orders;

      const createdDate = new Date(v.created_at);

      // Month tracking
      if (createdDate >= thisMonthStart) {
        thisMonthCount++;
        thisMonthViews += views;
        thisMonthGmv += gmv;
        thisMonthEngNum += (likes + comments + shares);
        thisMonthEngDenom += views;
        const dayStr = createdDate.toISOString().split('T')[0];
        if (!postingDaysThisMonth.includes(dayStr)) postingDaysThisMonth.push(dayStr);
      } else if (createdDate >= lastMonthStart && createdDate <= lastMonthEnd) {
        lastMonthCount++;
        lastMonthViews += views;
        lastMonthGmv += gmv;
        lastMonthEngNum += (likes + comments + shares);
        lastMonthEngDenom += views;
      }

      // Content type breakdown (use first tag or status-based)
      const contentType = tags[0] || (v.recording_status === 'POSTED' ? 'Posted' : 'Other');
      const existing = contentTypeMap.get(contentType) || { count: 0, views: 0, gmv: 0 };
      contentTypeMap.set(contentType, { count: existing.count + 1, views: existing.views + views, gmv: existing.gmv + gmv });

      enhancedVideos.push({
        id: v.id,
        title: tk?.title || productMap.get(v.product_id) || 'Video',
        product_name: productMap.get(v.product_id) || null,
        cover_image_url: tk?.cover_image_url || null,
        views,
        likes,
        comments,
        shares,
        engagement_pct: engPct,
        gmv,
        orders,
        content_grade: tk?.content_grade || null,
        content_tags: tags,
        posted_at: v.created_at,
        share_url: tk?.share_url || v.posted_url || null,
        duration: tk?.duration || null,
        status: v.recording_status || v.status || 'UNKNOWN',
      });
    }

    // Compute overview
    const postedCount = postedVideoIds.length;
    const avgEngagement = totalViews > 0
      ? Math.round(((totalLikes + totalComments + totalShares) / totalViews) * 10000) / 100
      : 0;

    // Month-over-month changes
    const viewsChange = lastMonthViews > 0 ? Math.round(((thisMonthViews - lastMonthViews) / lastMonthViews) * 100) : 0;
    const thisMonthEng = thisMonthEngDenom > 0 ? (thisMonthEngNum / thisMonthEngDenom) * 100 : 0;
    const lastMonthEng = lastMonthEngDenom > 0 ? (lastMonthEngNum / lastMonthEngDenom) * 100 : 0;
    const engChange = lastMonthEng > 0 ? Math.round(((thisMonthEng - lastMonthEng) / lastMonthEng) * 100) : 0;
    const gmvChange = lastMonthGmv > 0 ? Math.round(((thisMonthGmv - lastMonthGmv) / lastMonthGmv) * 100) : 0;

    // Content breakdown
    const contentBreakdown = Array.from(contentTypeMap.entries())
      .map(([type, data]) => ({
        content_type: type,
        count: data.count,
        total_views: data.views,
        avg_views: data.count > 0 ? Math.round(data.views / data.count) : 0,
        total_gmv: data.gmv,
      }))
      .sort((a, b) => b.total_views - a.total_views)
      .slice(0, 10);

    return NextResponse.json({
      ok: true,
      data: {
        overview: {
          total_videos: allVideos.length,
          posted_videos: postedCount,
          total_views: totalViews,
          total_likes: totalLikes,
          total_comments: totalComments,
          total_shares: totalShares,
          total_gmv: totalGmv,
          total_orders: totalOrders,
          avg_engagement: avgEngagement,
        },
        videos: enhancedVideos,
        content_breakdown: contentBreakdown,
        posting_frequency: {
          this_month: thisMonthCount,
          last_month: lastMonthCount,
          posting_days_this_month: postingDaysThisMonth.sort(),
        },
        month_over_month: {
          views_change_pct: viewsChange,
          engagement_change_pct: engChange,
          gmv_change_pct: gmvChange,
        },
      },
      correlation_id: correlationId,
    }, {
      headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('[client/analytics/enhanced] Error:', err);
    return createApiErrorResponse('DB_ERROR', 'Internal server error', 500, correlationId);
  }
}
