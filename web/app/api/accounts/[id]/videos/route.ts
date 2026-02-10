import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * GET /api/accounts/[id]/videos
 * Get all videos posted to this account
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const { id } = await params;
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { data: videos, error } = await supabaseAdmin
      .from('videos')
      .select('id, title, status, recording_status, tiktok_url, tiktok_views, tiktok_likes, tiktok_comments, tiktok_shares, created_at, product:product_id(id,name,brand)')
      .eq('account_id', id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error(`[${correlationId}] Error fetching account videos:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to fetch videos', 500, correlationId);
    }

    // Flatten product data
    const videosFlattened = (videos || []).map((v: any) => ({
      ...v,
      product_name: v.product?.name || null,
      product_brand: v.product?.brand || null,
      product: undefined,
    }));

    const response = NextResponse.json({
      ok: true,
      data: videosFlattened,
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Account videos GET error:`, error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Internal server error',
      500,
      correlationId
    );
  }
}
