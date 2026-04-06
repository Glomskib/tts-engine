/**
 * GET  /api/launch-sync       — list launches for current user
 * POST /api/launch-sync       — create a new product launch
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { logEventSafe } from '@/lib/events-log';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const p = request.nextUrl.searchParams;
  const status = p.get('status');
  const limit = Math.min(parseInt(p.get('limit') || '50', 10), 100);
  const offset = parseInt(p.get('offset') || '0', 10);

  let query = supabaseAdmin
    .from('product_launches')
    .select('*, products(name, product_image_url), brands(name)', { count: 'exact' })
    .eq('workspace_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, count, error } = await query;
  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  // Enrich with content/affiliate counts
  const launchIds = (data || []).map((l: any) => l.id);

  let ccMap: Record<string, number> = {};
  let acMap: Record<string, number> = {};

  if (launchIds.length) {
    const [contentRes, affRes] = await Promise.all([
      supabaseAdmin
        .from('launch_content')
        .select('launch_id')
        .in('launch_id', launchIds),
      supabaseAdmin
        .from('launch_affiliates')
        .select('launch_id')
        .in('launch_id', launchIds),
    ]);

    for (const r of contentRes.data || []) {
      ccMap[r.launch_id] = (ccMap[r.launch_id] || 0) + 1;
    }
    for (const r of affRes.data || []) {
      acMap[r.launch_id] = (acMap[r.launch_id] || 0) + 1;
    }
  }

  const enriched = (data || []).map((l: any) => ({
    ...l,
    product_name: l.products?.name || null,
    brand_name: l.brands?.name || null,
    content_count: ccMap[l.id] || 0,
    affiliate_count: acMap[l.id] || 0,
    products: undefined,
    brands: undefined,
  }));

  return NextResponse.json({ ok: true, data: { items: enriched, total: count || 0 }, correlation_id: correlationId });
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  let body: {
    title: string;
    product_id?: string;
    brand_id?: string;
    asin?: string;
    source_url?: string;
    tiktok_url?: string;
    image_url?: string;
    cost_per_unit?: number;
    selling_price?: number;
    mode?: 'solo' | 'agency';
    target_videos?: number;
    target_affiliates?: number;
    notes?: string;
  };

  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  if (!body.title?.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'title is required', 400, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('product_launches')
    .insert({
      workspace_id: user.id,
      title: body.title.trim(),
      product_id: body.product_id || null,
      brand_id: body.brand_id || null,
      asin: body.asin?.trim() || null,
      source_url: body.source_url?.trim() || null,
      tiktok_url: body.tiktok_url?.trim() || null,
      image_url: body.image_url?.trim() || null,
      cost_per_unit: body.cost_per_unit || null,
      selling_price: body.selling_price || null,
      mode: body.mode || 'solo',
      target_videos: body.target_videos || 10,
      target_affiliates: body.target_affiliates || 0,
      notes: body.notes?.trim() || null,
      status: 'draft',
    })
    .select()
    .single();

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  // Track launch creation
  logEventSafe(supabaseAdmin, {
    entity_type: 'launch_sync',
    entity_id: data.id,
    event_type: 'launch_created',
    payload: { user_id: user.id, title: data.title, mode: data.mode, asin: data.asin },
  }).catch(() => {});

  return NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 201 });
}
