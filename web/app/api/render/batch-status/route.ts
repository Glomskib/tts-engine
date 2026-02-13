import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * GET /api/render/batch-status
 * Bolt dashboard endpoint — returns all videos in AI_RENDERING or READY_FOR_REVIEW
 * with summary counts and per-video details.
 * Auth: API key required.
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Valid API key required', 401, correlationId);
  }

  // Fetch videos in active pipeline statuses
  const { data: videos, error } = await supabaseAdmin
    .from('videos')
    .select('id, product_id, render_task_id, render_provider, recording_status, runway_video_url, final_video_url, compose_render_id, last_status_changed_at, created_at')
    .in('recording_status', ['AI_RENDERING', 'READY_FOR_REVIEW'])
    .order('created_at', { ascending: true });

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Fetch product details
  const productIds = [...new Set((videos || []).map((v) => v.product_id).filter(Boolean))];
  let productMap: Record<string, { name: string; brand: string | null }> = {};

  if (productIds.length > 0) {
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id, name, brand')
      .in('id', productIds);

    productMap = (products || []).reduce((acc, p) => {
      acc[p.id] = { name: p.name, brand: p.brand };
      return acc;
    }, {} as Record<string, { name: string; brand: string | null }>);
  }

  const now = Date.now();

  const items = (videos || []).map((v) => {
    const sinceChange = v.last_status_changed_at
      ? now - new Date(v.last_status_changed_at).getTime()
      : now - new Date(v.created_at).getTime();
    const elapsedMin = Math.round(sinceChange / 60000);

    const prod = productMap[v.product_id] || { name: null, brand: null };

    return {
      video_id: v.id,
      product_name: prod.name,
      brand: prod.brand,
      recording_status: v.recording_status,
      render_task_id: v.render_task_id,
      render_url: v.final_video_url || v.runway_video_url || null,
      time_elapsed: `${elapsedMin}m`,
    };
  });

  // Summary counts
  const rendering = items.filter((v) => v.recording_status === 'AI_RENDERING').length;
  const readyForReview = items.filter((v) => v.recording_status === 'READY_FOR_REVIEW').length;

  // Count recently approved/rejected (last 24h) for context
  const oneDayAgo = new Date(now - 86400000).toISOString();

  const [{ count: approvedCount }, { count: rejectedCount }] = await Promise.all([
    supabaseAdmin
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('recording_status', 'READY_TO_POST')
      .gte('last_status_changed_at', oneDayAgo),
    supabaseAdmin
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('recording_status', 'REJECTED')
      .gte('last_status_changed_at', oneDayAgo),
  ]);

  const response = NextResponse.json({
    ok: true,
    data: {
      summary: {
        rendering,
        ready_for_review: readyForReview,
        approved_24h: approvedCount || 0,
        rejected_24h: rejectedCount || 0,
      },
      videos: items,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
