import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * POST /api/videos/metrics/sync
 * Snapshots current tiktok_videos metrics into video_metrics table for historical tracking.
 * Only processes tiktok_videos that have a video_id FK (linked to internal videos table).
 *
 * Body: { product_id?: string }
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const userId = authContext.user.id;
  let body: { product_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  try {
    // Fetch tiktok_videos that have a linked video_id
    let query = supabaseAdmin
      .from('tiktok_videos')
      .select('id, video_id, view_count, like_count, comment_count, share_count, account_id, attributed_orders, attributed_gmv')
      .eq('user_id', userId)
      .not('video_id', 'is', null);

    if (body.product_id) {
      query = query.eq('product_id', body.product_id);
    }

    const { data: videos, error } = await query;
    if (error) throw error;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let upserted = 0;
    let skipped = 0;

    for (const v of videos || []) {
      const { error: upsertErr } = await supabaseAdmin
        .from('video_metrics')
        .upsert({
          video_id: v.video_id,
          account_id: v.account_id || null,
          metric_date: today,
          views: Number(v.view_count) || 0,
          likes: Number(v.like_count) || 0,
          comments: Number(v.comment_count) || 0,
          shares: Number(v.share_count) || 0,
          orders: Number(v.attributed_orders) || 0,
          revenue: Number(v.attributed_gmv) || 0,
        }, {
          onConflict: 'video_id,metric_date',
          ignoreDuplicates: false,
        });

      if (upsertErr) {
        console.warn(`[${correlationId}] metrics sync upsert error for video_id=${v.video_id}:`, upsertErr.message);
        skipped++;
      } else {
        upserted++;
      }
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        metric_date: today,
        videos_processed: (videos || []).length,
        metrics_upserted: upserted,
        skipped,
      },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;

  } catch (err: any) {
    console.error(`[${correlationId}] /api/videos/metrics/sync error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to sync metrics', 500, correlationId);
  }
}
