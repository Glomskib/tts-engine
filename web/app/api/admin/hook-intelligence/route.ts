/**
 * API: Hook Intelligence
 *
 * GET /api/admin/hook-intelligence — query winning hooks with filters
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
  const clusterId = url.searchParams.get('cluster_id');
  const productKey = url.searchParams.get('product_key');
  const minScore = url.searchParams.get('min_score');
  const daysBack = url.searchParams.get('days_back');
  const hookSource = url.searchParams.get('source');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);

  let query = supabaseAdmin
    .from('winning_hooks')
    .select('id, hook_text, hook_source, performance_score, views, likes, engagement_rate, product_name, trend_cluster_id, created_at')
    .eq('workspace_id', workspaceId)
    .order('performance_score', { ascending: false })
    .limit(limit);

  if (clusterId) query = query.eq('trend_cluster_id', clusterId);
  if (productKey) query = query.eq('normalized_product_key', productKey);
  if (minScore) query = query.gte('performance_score', parseInt(minScore, 10));
  if (hookSource) query = query.eq('hook_source', hookSource);
  if (daysBack) {
    const since = new Date(Date.now() - parseInt(daysBack, 10) * 86400000).toISOString();
    query = query.gte('created_at', since);
  }

  const { data, error } = await query;
  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Aggregate stats
  const hooks = data || [];
  const avgScore = hooks.length > 0
    ? Math.round(hooks.reduce((s, h) => s + h.performance_score, 0) / hooks.length)
    : 0;

  return NextResponse.json({
    ok: true,
    data: hooks,
    stats: {
      total: hooks.length,
      avg_score: avgScore,
      top_score: hooks.length > 0 ? hooks[0].performance_score : 0,
    },
    correlation_id: correlationId,
  });
}
