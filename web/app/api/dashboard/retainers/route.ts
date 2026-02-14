import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Fetch brands with active retainers (period_end >= today, type != 'none')
  const { data: brands, error } = await supabaseAdmin
    .from('brands')
    .select('id, name, logo_url, brand_image_url, retainer_type, retainer_video_goal, retainer_period_start, retainer_period_end, retainer_payout_amount, retainer_bonus_tiers, retainer_notes')
    .eq('user_id', authContext.user.id)
    .neq('retainer_type', 'none')
    .gte('retainer_period_end', today);

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  if (!brands || brands.length === 0) {
    return NextResponse.json({ ok: true, data: [] });
  }

  // For each brand, count qualifying videos via products
  const brandIds = brands.map(b => b.id);

  // Get product IDs linked to these brands
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, brand_id')
    .in('brand_id', brandIds);

  const productsByBrand = new Map<string, string[]>();
  for (const p of products || []) {
    if (!p.brand_id) continue;
    const existing = productsByBrand.get(p.brand_id) || [];
    existing.push(p.id);
    productsByBrand.set(p.brand_id, existing);
  }

  // Build result with video counts per brand
  const results = await Promise.all(brands.map(async (brand) => {
    const productIds = productsByBrand.get(brand.id) || [];
    let videoCount = 0;

    if (productIds.length > 0 && brand.retainer_period_start && brand.retainer_period_end) {
      const { count } = await supabaseAdmin
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .in('product_id', productIds)
        .gte('created_at', brand.retainer_period_start)
        .lte('created_at', brand.retainer_period_end + 'T23:59:59Z')
        .in('recording_status', ['POSTED', 'READY_TO_POST', 'READY_FOR_REVIEW', 'EDITED', 'RECORDED']);

      videoCount = count || 0;
    }

    return {
      ...brand,
      video_count: videoCount,
    };
  }));

  return NextResponse.json({ ok: true, data: results });
}
