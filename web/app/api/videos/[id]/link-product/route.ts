import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * POST /api/videos/[id]/link-product
 * Links a tiktok_video to a product.
 *
 * [id] = tiktok_videos UUID
 * Body: { product_id: "uuid" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id: videoUuid } = await params;

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const userId = authContext.user.id;

  let body: { product_id?: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  if (!body.product_id) {
    return createApiErrorResponse('MISSING_PRODUCT_ID', 'product_id is required', 400, correlationId);
  }

  try {
    // Verify video belongs to user
    const { data: video, error: videoErr } = await supabaseAdmin
      .from('tiktok_videos')
      .select('id')
      .eq('id', videoUuid)
      .eq('user_id', userId)
      .single();

    if (videoErr || !video) {
      return createApiErrorResponse('NOT_FOUND', 'Video not found', 404, correlationId);
    }

    // Verify product belongs to same user
    const { data: product, error: productErr } = await supabaseAdmin
      .from('products')
      .select('id, name, brand')
      .eq('id', body.product_id)
      .eq('user_id', userId)
      .single();

    if (productErr || !product) {
      return createApiErrorResponse('PRODUCT_NOT_FOUND', 'Product not found', 404, correlationId);
    }

    // Update the tiktok_video
    const { error: updateErr } = await supabaseAdmin
      .from('tiktok_videos')
      .update({
        product_id: product.id,
        matched_product: product.name,
        brand_id: null, // will be set below if product has brand
        matched_brand: null,
      })
      .eq('id', videoUuid);

    if (updateErr) throw updateErr;

    // If the product has a brand, also link the brand
    if (product.brand) {
      const { data: brand } = await supabaseAdmin
        .from('brands')
        .select('id, name')
        .eq('user_id', userId)
        .ilike('name', product.brand)
        .limit(1)
        .single();

      if (brand) {
        await supabaseAdmin
          .from('tiktok_videos')
          .update({ brand_id: brand.id, matched_brand: brand.name })
          .eq('id', videoUuid);
      }
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        video_id: videoUuid,
        product_id: product.id,
        product_name: product.name,
      },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;

  } catch (err: any) {
    console.error(`[${correlationId}] /api/videos/${videoUuid}/link-product error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to link product', 500, correlationId);
  }
}
