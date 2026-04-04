/**
 * API: Opportunity Feed
 *
 * GET  /api/admin/opportunity-feed  — actionable feed from trend clusters
 * POST /api/admin/opportunity-feed  — actions: create_video, research, dismiss
 *
 * Surfaces ACT_NOW, TEST_SOON, and WATCH clusters with community intelligence.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const url = new URL(request.url);
  const section = url.searchParams.get('section'); // ACT_NOW, TEST_SOON, WATCH, or null for all
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

  // Build query: fetch actionable clusters (exclude SKIP + dismissed)
  let query = supabaseAdmin
    .from('trend_clusters')
    .select('id, display_name, normalized_product_key, trend_score, earlyness_score, saturation_score, recommendation, creator_count, signal_count, signals_24h, velocity_score, first_signal_at, last_signal_at, community_wins, community_total_views, community_best_hook, forecast_breakdown, status')
    .eq('workspace_id', workspaceId)
    .neq('status', 'dismissed')
    .neq('recommendation', 'SKIP')
    .limit(limit);

  if (section) {
    query = query.eq('recommendation', section);
  }

  // Order: ACT_NOW first, then TEST_SOON, then WATCH; within each by trend_score desc
  query = query
    .order('recommendation', { ascending: true }) // ACT_NOW < TEST_SOON < WATCH alphabetically
    .order('trend_score', { ascending: false });

  const { data, error } = await query;
  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Fetch winning hooks for returned clusters (lightweight batch)
  const clusterIds = (data || []).map((c: { id: string }) => c.id);
  let hooksMap: Record<string, { hook_text: string; performance_score: number }[]> = {};

  if (clusterIds.length > 0) {
    const { data: hooks } = await supabaseAdmin
      .from('winning_hooks')
      .select('trend_cluster_id, hook_text, performance_score')
      .in('trend_cluster_id', clusterIds)
      .order('performance_score', { ascending: false })
      .limit(100);

    if (hooks) {
      hooksMap = {};
      for (const h of hooks) {
        const cid = h.trend_cluster_id as string;
        if (!hooksMap[cid]) hooksMap[cid] = [];
        if (hooksMap[cid].length < 3) {
          hooksMap[cid].push({ hook_text: h.hook_text, performance_score: h.performance_score });
        }
      }
    }
  }

  // Enrich feed items
  interface FeedCluster {
    id: string;
    recommendation: string;
    [key: string]: unknown;
  }

  const feed = (data || []).map((cluster: FeedCluster) => ({
    ...cluster,
    winning_hooks: hooksMap[cluster.id] || [],
  }));

  return NextResponse.json({
    ok: true,
    data: feed,
    counts: {
      act_now: feed.filter(f => f.recommendation === 'ACT_NOW').length,
      test_soon: feed.filter(f => f.recommendation === 'TEST_SOON').length,
      watch: feed.filter(f => f.recommendation === 'WATCH').length,
    },
    correlation_id: correlationId,
  });
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const body = await request.json();
  const { cluster_id, action } = body;

  if (!cluster_id || !action) {
    return createApiErrorResponse('BAD_REQUEST', 'cluster_id and action are required', 400, correlationId);
  }

  // Verify cluster
  const { data: cluster } = await supabaseAdmin
    .from('trend_clusters')
    .select('id, display_name, normalized_product_key')
    .eq('id', cluster_id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!cluster) {
    return createApiErrorResponse('NOT_FOUND', 'Cluster not found', 404, correlationId);
  }

  switch (action) {
    case 'create_video': {
      // Create a content_item in briefing status linked to this product
      const title = `Video: ${cluster.display_name}`;

      // Look up product by name if possible
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('id')
        .ilike('name', cluster.display_name)
        .limit(1)
        .maybeSingle();

      const { data: item, error: itemErr } = await supabaseAdmin
        .from('content_items')
        .insert({
          workspace_id: authContext.user.id,
          title,
          status: 'briefing',
          source_type: 'product_research',
          source_ref_id: cluster_id,
          product_id: product?.id ?? null,
          short_id: 'temp',
          created_by: authContext.user.id,
        })
        .select('id, title, status, short_id')
        .single();

      if (itemErr) {
        return createApiErrorResponse('DB_ERROR', itemErr.message, 500, correlationId);
      }

      return NextResponse.json({
        ok: true,
        data: item,
        message: `Content item created: ${item?.short_id}`,
        correlation_id: correlationId,
      }, { status: 201 });
    }

    case 'dismiss': {
      await supabaseAdmin
        .from('trend_clusters')
        .update({ status: 'dismissed' })
        .eq('id', cluster_id);

      return NextResponse.json({ ok: true, correlation_id: correlationId });
    }

    default:
      return createApiErrorResponse('BAD_REQUEST', `Unknown action: ${action}`, 400, correlationId);
  }
}
