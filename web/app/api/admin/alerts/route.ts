/**
 * API: Opportunity Alerts
 *
 * GET  /api/admin/alerts — list alerts (unseen first, paginated)
 * POST /api/admin/alerts — actions: mark_seen, dismiss, mark_all_seen
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
  const filter = url.searchParams.get('filter'); // unseen, all, dismissed
  const alertType = url.searchParams.get('type'); // ACT_NOW, VELOCITY_SPIKE, COMMUNITY_MOMENTUM
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let query = supabaseAdmin
    .from('opportunity_alerts')
    .select('id, trend_cluster_id, product_name, alert_type, recommendation, earlyness_score, saturation_score, velocity_score, community_wins, community_views, best_hook, reason_text, created_at, seen_at, dismissed_at', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filter === 'unseen') {
    query = query.is('seen_at', null).is('dismissed_at', null);
  } else if (filter === 'dismissed') {
    query = query.not('dismissed_at', 'is', null);
  } else {
    // Default: exclude dismissed
    query = query.is('dismissed_at', null);
  }

  if (alertType) {
    query = query.eq('alert_type', alertType);
  }

  const { data, count, error } = await query;
  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Get unseen count
  const { count: unseenCount } = await supabaseAdmin
    .from('opportunity_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .is('seen_at', null)
    .is('dismissed_at', null);

  return NextResponse.json({
    ok: true,
    data: data || [],
    total: count ?? 0,
    unseen_count: unseenCount ?? 0,
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
  const { action, alert_id, alert_ids } = body;

  if (!action) {
    return createApiErrorResponse('BAD_REQUEST', 'action is required', 400, correlationId);
  }

  const now = new Date().toISOString();

  switch (action) {
    case 'mark_seen': {
      if (!alert_id) {
        return createApiErrorResponse('BAD_REQUEST', 'alert_id is required', 400, correlationId);
      }
      await supabaseAdmin
        .from('opportunity_alerts')
        .update({ seen_at: now })
        .eq('id', alert_id)
        .eq('workspace_id', workspaceId)
        .is('seen_at', null);

      return NextResponse.json({ ok: true, correlation_id: correlationId });
    }

    case 'dismiss': {
      const ids = alert_ids || (alert_id ? [alert_id] : []);
      if (ids.length === 0) {
        return createApiErrorResponse('BAD_REQUEST', 'alert_id or alert_ids required', 400, correlationId);
      }
      await supabaseAdmin
        .from('opportunity_alerts')
        .update({ dismissed_at: now, seen_at: now })
        .in('id', ids)
        .eq('workspace_id', workspaceId);

      return NextResponse.json({ ok: true, dismissed: ids.length, correlation_id: correlationId });
    }

    case 'mark_all_seen': {
      const { data: updated } = await supabaseAdmin
        .from('opportunity_alerts')
        .update({ seen_at: now })
        .eq('workspace_id', workspaceId)
        .is('seen_at', null)
        .select('id');

      return NextResponse.json({ ok: true, marked: updated?.length ?? 0, correlation_id: correlationId });
    }

    default:
      return createApiErrorResponse('BAD_REQUEST', `Unknown action: ${action}`, 400, correlationId);
  }
}
