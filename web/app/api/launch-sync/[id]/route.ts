/**
 * GET    /api/launch-sync/[id]  — get launch detail with content + affiliates
 * PATCH  /api/launch-sync/[id]  — update launch
 * DELETE /api/launch-sync/[id]  — delete launch (cascades)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteCtx) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id } = await ctx.params;

  const [launchRes, contentRes, affiliateRes] = await Promise.all([
    supabaseAdmin
      .from('product_launches')
      .select('*, products(name, product_image_url, primary_link, tiktok_showcase_url), brands(name)')
      .eq('id', id)
      .eq('workspace_id', user.id)
      .single(),
    supabaseAdmin
      .from('launch_content')
      .select('*')
      .eq('launch_id', id)
      .eq('workspace_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('launch_affiliates')
      .select('*')
      .eq('launch_id', id)
      .eq('workspace_id', user.id)
      .order('total_views', { ascending: false })
      .limit(100),
  ]);

  if (launchRes.error) return createApiErrorResponse('NOT_FOUND', 'Launch not found', 404, correlationId);

  return NextResponse.json({
    ok: true,
    data: {
      ...launchRes.data,
      product_name: launchRes.data.products?.name || null,
      product_image: launchRes.data.products?.product_image_url || null,
      product_link: launchRes.data.products?.primary_link || null,
      tiktok_showcase: launchRes.data.products?.tiktok_showcase_url || null,
      brand_name: launchRes.data.brands?.name || null,
      products: undefined,
      brands: undefined,
      content: contentRes.data || [],
      affiliates: affiliateRes.data || [],
    },
    correlation_id: correlationId,
  });
}

export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id } = await ctx.params;
  let body: Record<string, unknown>;

  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  // Only allow known fields
  const allowed = [
    'title', 'asin', 'source_url', 'tiktok_url', 'image_url',
    'cost_per_unit', 'selling_price', 'mode', 'status',
    'target_videos', 'target_affiliates', 'hooks', 'scripts',
    'angles', 'creator_brief', 'notes', 'product_id', 'brand_id',
  ];

  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
  }

  if (Object.keys(updates).length === 0) {
    return createApiErrorResponse('BAD_REQUEST', 'No valid fields to update', 400, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('product_launches')
    .update(updates)
    .eq('id', id)
    .eq('workspace_id', user.id)
    .select()
    .single();

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id } = await ctx.params;

  const { error } = await supabaseAdmin
    .from('product_launches')
    .delete()
    .eq('id', id)
    .eq('workspace_id', user.id);

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  return NextResponse.json({ ok: true, correlation_id: correlationId });
}
