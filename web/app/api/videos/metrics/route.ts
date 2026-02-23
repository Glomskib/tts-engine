import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * GET /api/videos/metrics
 * Returns video metrics with optional filtering by product/brand and period.
 *
 * Query params:
 *   product_id — filter to a specific product
 *   brand_id   — filter to a specific brand
 *   period     — 7d | 30d | 90d | all (default: 30d)
 *   sort       — views | likes | engagement | recent (default: recent)
 *   limit      — max results (default: 50)
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const userId = authContext.user.id;
  const params = request.nextUrl.searchParams;
  const productId = params.get('product_id');
  const brandId = params.get('brand_id');
  const period = params.get('period') || '30d';
  const sort = params.get('sort') || 'recent';
  const limit = Math.min(parseInt(params.get('limit') || '50', 10) || 50, 200);

  try {
    // Build period filter
    let periodStart: number | null = null;
    const nowSec = Math.floor(Date.now() / 1000);
    switch (period) {
      case '7d':  periodStart = nowSec - 7 * 86400; break;
      case '30d': periodStart = nowSec - 30 * 86400; break;
      case '90d': periodStart = nowSec - 90 * 86400; break;
      case 'all': default: periodStart = null;
    }

    let query = supabaseAdmin
      .from('tiktok_videos')
      .select('id, tiktok_video_id, title, view_count, like_count, comment_count, share_count, product_id, brand_id, create_time')
      .eq('user_id', userId);

    if (productId) query = query.eq('product_id', productId);
    if (brandId) query = query.eq('brand_id', brandId);
    if (periodStart) query = query.gte('create_time', periodStart);

    const { data: videos, error } = await query;
    if (error) throw error;

    const rows = (videos || []).map(v => {
      const views = Number(v.view_count) || 0;
      const likes = Number(v.like_count) || 0;
      const comments = Number(v.comment_count) || 0;
      const shares = Number(v.share_count) || 0;
      const engagement_rate = views > 0
        ? parseFloat(((likes + comments + shares) / views * 100).toFixed(2))
        : 0;
      return { ...v, view_count: views, like_count: likes, comment_count: comments, share_count: shares, engagement_rate };
    });

    // Sort
    switch (sort) {
      case 'views':      rows.sort((a, b) => b.view_count - a.view_count); break;
      case 'likes':      rows.sort((a, b) => b.like_count - a.like_count); break;
      case 'engagement': rows.sort((a, b) => b.engagement_rate - a.engagement_rate); break;
      case 'recent': default: rows.sort((a, b) => (b.create_time || 0) - (a.create_time || 0));
    }

    const limited = rows.slice(0, limit);

    // Compute totals
    const totals = {
      total_views: rows.reduce((s, v) => s + v.view_count, 0),
      total_likes: rows.reduce((s, v) => s + v.like_count, 0),
      total_comments: rows.reduce((s, v) => s + v.comment_count, 0),
      total_shares: rows.reduce((s, v) => s + v.share_count, 0),
      avg_engagement: rows.length > 0
        ? parseFloat((rows.reduce((s, v) => s + v.engagement_rate, 0) / rows.length).toFixed(2))
        : 0,
    };

    const response = NextResponse.json({
      ok: true,
      data: { videos: limited, totals, count: rows.length },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;

  } catch (err: any) {
    console.error(`[${correlationId}] /api/videos/metrics error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch video metrics', 500, correlationId);
  }
}
