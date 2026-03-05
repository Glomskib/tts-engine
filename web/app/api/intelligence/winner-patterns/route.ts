/**
 * GET /api/intelligence/winner-patterns
 *   Returns winner patterns for the workspace, sorted by score desc.
 *   Query params: platform, product_id, format_tag, min_sample, limit
 *
 * POST /api/intelligence/winner-patterns
 *   Trigger winner detection for the workspace (admin only).
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { detectWinners } from '@/lib/content-intelligence/winners';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');
  const productId = searchParams.get('product_id');
  const formatTag = searchParams.get('format_tag');
  const minSample = parseInt(searchParams.get('min_sample') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

  let query = supabaseAdmin
    .from('winner_patterns_v2')
    .select('*, products:product_id(name)')
    .eq('workspace_id', user.id)
    .gte('sample_size', minSample)
    .order('score', { ascending: false })
    .limit(limit);

  if (platform) query = query.eq('platform', platform);
  if (productId) query = query.eq('product_id', productId);
  if (formatTag) query = query.eq('format_tag', formatTag);

  const { data, error } = await query;

  if (error) {
    console.error('[winner-patterns] GET error:', error);
    return createApiErrorResponse('INTERNAL', 'Failed to fetch patterns', 500, correlationId);
  }

  const patterns = (data || []).map((row: Record<string, unknown>) => ({
    ...row,
    product_name: (row.products as { name: string } | null)?.name || null,
    products: undefined,
  }));

  return NextResponse.json({ ok: true, data: patterns, correlation_id: correlationId });
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const { user, isAdmin } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  try {
    const result = await detectWinners(user.id);
    return NextResponse.json({ ok: true, data: result, correlation_id: correlationId });
  } catch (err) {
    console.error('[winner-patterns] POST error:', err);
    return createApiErrorResponse(
      'INTERNAL',
      err instanceof Error ? err.message : 'Detection failed',
      500,
      correlationId,
    );
  }
}
