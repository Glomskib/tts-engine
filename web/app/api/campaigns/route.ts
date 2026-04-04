/**
 * GET /api/campaigns
 *
 * Lists all campaigns (experiments with campaign_config) for the current user.
 * Admins see all. Regular users see campaigns for their brands.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let query = supabaseAdmin
    .from('experiments')
    .select('id, name, status, hook_count, winner_count, created_at, updated_at, brand_id, product_id, campaign_config, brands:brand_id(name), products:product_id(name)')
    .not('campaign_config', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  // Non-admins: only see campaigns for brands they belong to
  if (!auth.isAdmin) {
    const { data: memberships } = await supabaseAdmin
      .from('brand_members')
      .select('brand_id')
      .eq('user_id', auth.user.id);
    const brandIds = (memberships || []).map((m: { brand_id: string }) => m.brand_id);
    if (brandIds.length === 0) {
      return NextResponse.json({ ok: true, data: [], meta: { total: 0 }, correlation_id: correlationId });
    }
    query = query.in('brand_id', brandIds);
  }

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const rows = (data || []).map((e: Record<string, unknown>) => {
    const cc = e.campaign_config as Record<string, unknown> | null;
    const progress = cc?.generation_progress as Record<string, unknown> | null;
    return {
      id: e.id,
      name: e.name,
      status: e.status,
      hook_count: e.hook_count,
      winner_count: e.winner_count,
      created_at: e.created_at,
      brand_name: (e.brands as { name: string } | null)?.name ?? null,
      product_name: (e.products as { name: string } | null)?.name ?? null,
      platform: cc?.platform ?? null,
      generation_status: cc?.generation_status ?? null,
      hooks_generated: progress?.hooks_generated ?? 0,
      scripts_generated: progress?.scripts_generated ?? 0,
      items_created: progress?.items_created ?? 0,
      personas: Array.isArray(cc?.persona_ids) ? cc.persona_ids.length : 0,
      angles: Array.isArray(cc?.angles) ? cc.angles.length : 0,
    };
  });

  return NextResponse.json({ ok: true, data: rows, meta: { total: rows.length }, correlation_id: correlationId });
}
