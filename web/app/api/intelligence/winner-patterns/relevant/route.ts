/**
 * GET /api/intelligence/winner-patterns/relevant?content_item_id=
 *
 * Returns winner patterns relevant to a specific content item.
 * Matches by product_id and platform, with fallback to platform-only.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const contentItemId = searchParams.get('content_item_id');
  if (!contentItemId) {
    return createApiErrorResponse('BAD_REQUEST', 'content_item_id is required', 400, correlationId);
  }

  // Get content item to find product_id and platform
  const { data: contentItem } = await supabaseAdmin
    .from('content_items')
    .select('product_id')
    .eq('id', contentItemId)
    .eq('workspace_id', user.id)
    .single();

  if (!contentItem) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  // Also check if there's a post to determine platform
  const { data: post } = await supabaseAdmin
    .from('content_item_posts')
    .select('platform')
    .eq('content_item_id', contentItemId)
    .eq('workspace_id', user.id)
    .limit(1)
    .maybeSingle();

  const platform = post?.platform || 'tiktok';
  const productId = contentItem.product_id;

  // Try product + platform match first
  let patterns: Record<string, unknown>[] = [];

  if (productId) {
    const { data } = await supabaseAdmin
      .from('winner_patterns_v2')
      .select('*, products:product_id(name)')
      .eq('workspace_id', user.id)
      .eq('platform', platform)
      .eq('product_id', productId)
      .order('score', { ascending: false })
      .limit(5);

    if (data && data.length > 0) {
      patterns = data;
    }
  }

  // Fallback: platform-only if no product match
  if (patterns.length < 3) {
    const existingIds = patterns.map((p: Record<string, unknown>) => p.id as string);
    const { data: fallback } = await supabaseAdmin
      .from('winner_patterns_v2')
      .select('*, products:product_id(name)')
      .eq('workspace_id', user.id)
      .eq('platform', platform)
      .order('score', { ascending: false })
      .limit(5);

    if (fallback) {
      for (const row of fallback) {
        if (!existingIds.includes(row.id) && patterns.length < 5) {
          patterns.push(row);
        }
      }
    }
  }

  const result = patterns.map((row: Record<string, unknown>) => ({
    ...row,
    product_name: (row.products as { name: string } | null)?.name || null,
    products: undefined,
  }));

  return NextResponse.json({ ok: true, data: result, correlation_id: correlationId });
}
