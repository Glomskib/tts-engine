import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * GET /api/render/batch-status
 * Returns status of all videos currently in AI_RENDERING.
 * Auth: API key required.
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Valid API key required', 401, correlationId);
  }

  const { data: videos, error } = await supabaseAdmin
    .from('videos')
    .select('id, product_id, render_task_id, render_provider, recording_status, runway_video_url, final_video_url, compose_render_id, created_at')
    .eq('recording_status', 'AI_RENDERING')
    .not('render_task_id', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Fetch product names for each video
  const productIds = [...new Set((videos || []).map((v) => v.product_id).filter(Boolean))];
  let productMap: Record<string, string> = {};

  if (productIds.length > 0) {
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id, name')
      .in('id', productIds);

    productMap = (products || []).reduce((acc, p) => {
      acc[p.id] = p.name;
      return acc;
    }, {} as Record<string, string>);
  }

  const now = Date.now();

  const renders = (videos || []).map((v) => {
    const createdAt = new Date(v.created_at).getTime();
    const elapsedMs = now - createdAt;
    const elapsedMin = Math.round(elapsedMs / 60000);

    let phase = 'runway_generating';
    if (v.compose_render_id && !v.final_video_url) {
      phase = 'composing';
    } else if (v.runway_video_url && !v.compose_render_id) {
      phase = 'awaiting_compose';
    }

    return {
      video_id: v.id,
      product_name: productMap[v.product_id] || null,
      render_task_id: v.render_task_id,
      render_provider: v.render_provider,
      phase,
      time_elapsed: `${elapsedMin}m`,
      created_at: v.created_at,
    };
  });

  const response = NextResponse.json({
    ok: true,
    data: {
      rendering: renders.length,
      renders,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
