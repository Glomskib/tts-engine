/**
 * API: Opportunity Radar — Trends (Clusters)
 *
 * GET  /api/admin/opportunity-radar/trends  — list trend clusters with scores
 * POST /api/admin/opportunity-radar/trends  — actions: dismiss, rescore, set_status
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';
import { rescoreCluster } from '@/lib/opportunity-radar/trend-scoring';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const label = url.searchParams.get('label');
  const minScore = url.searchParams.get('min_score');
  const recommendation = url.searchParams.get('recommendation');
  const maxSaturation = url.searchParams.get('max_saturation');
  const minEarlyness = url.searchParams.get('min_earlyness');
  const sortBy = url.searchParams.get('sort') || 'trend_score';
  const sortDir = url.searchParams.get('dir') === 'asc' ? true : false;

  const validSorts = ['trend_score', 'earlyness_score', 'saturation_score', 'creator_count', 'last_signal_at', 'signals_24h'];
  const sortColumn = validSorts.includes(sortBy) ? sortBy : 'trend_score';

  let query = supabaseAdmin
    .from('trend_clusters')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order(sortColumn, { ascending: sortDir });

  if (status) query = query.eq('status', status);
  if (label) query = query.eq('trend_label', label);
  if (minScore) query = query.gte('trend_score', parseInt(minScore, 10));
  if (recommendation) query = query.eq('recommendation', recommendation);
  if (maxSaturation) query = query.lte('saturation_score', parseInt(maxSaturation, 10));
  if (minEarlyness) query = query.gte('earlyness_score', parseInt(minEarlyness, 10));

  const { data, error } = await query;
  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: data || [],
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
  const { id, action } = body;

  if (!id || !action) {
    return createApiErrorResponse('BAD_REQUEST', 'id and action are required', 400, correlationId);
  }

  // Verify cluster belongs to workspace
  const { data: cluster } = await supabaseAdmin
    .from('trend_clusters')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!cluster) {
    return createApiErrorResponse('NOT_FOUND', 'Cluster not found', 404, correlationId);
  }

  switch (action) {
    case 'rescore': {
      const breakdown = await rescoreCluster(id);
      return NextResponse.json({ ok: true, data: breakdown, correlation_id: correlationId });
    }

    case 'dismiss': {
      const { error } = await supabaseAdmin
        .from('trend_clusters')
        .update({ status: 'dismissed' })
        .eq('id', id);

      if (error) {
        return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
      }
      return NextResponse.json({ ok: true, correlation_id: correlationId });
    }

    case 'set_status': {
      const validStatuses = ['new', 'hot', 'cooling', 'dismissed', 'actioned'];
      if (!body.status || !validStatuses.includes(body.status)) {
        return createApiErrorResponse('BAD_REQUEST', `status must be one of: ${validStatuses.join(', ')}`, 400, correlationId);
      }
      const { error } = await supabaseAdmin
        .from('trend_clusters')
        .update({ status: body.status })
        .eq('id', id);

      if (error) {
        return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
      }
      return NextResponse.json({ ok: true, correlation_id: correlationId });
    }

    default:
      return createApiErrorResponse('BAD_REQUEST', `Unknown action: ${action}`, 400, correlationId);
  }
}
