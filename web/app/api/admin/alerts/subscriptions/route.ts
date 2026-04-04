/**
 * API: Alert Subscriptions
 *
 * GET  /api/admin/alerts/subscriptions — list subscriptions
 * POST /api/admin/alerts/subscriptions — create/update subscription
 * DELETE via POST action: 'delete'
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';

export const runtime = 'nodejs';

const VALID_ALERT_TYPES = ['ACT_NOW', 'VELOCITY_SPIKE', 'COMMUNITY_MOMENTUM', 'ALL'];
const VALID_METHODS = ['in_app', 'email', 'webhook'];

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);

  const { data, error } = await supabaseAdmin
    .from('alert_subscriptions')
    .select('id, alert_type, delivery_method, destination, enabled, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data: data || [], correlation_id: correlationId });
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const body = await request.json();
  const { action } = body;

  if (action === 'delete') {
    const { id } = body;
    if (!id) {
      return createApiErrorResponse('BAD_REQUEST', 'id is required', 400, correlationId);
    }
    await supabaseAdmin
      .from('alert_subscriptions')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  }

  if (action === 'toggle') {
    const { id, enabled } = body;
    if (!id || typeof enabled !== 'boolean') {
      return createApiErrorResponse('BAD_REQUEST', 'id and enabled are required', 400, correlationId);
    }
    await supabaseAdmin
      .from('alert_subscriptions')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  }

  // Create new subscription
  const { alert_type, delivery_method, destination } = body;

  if (!alert_type || !VALID_ALERT_TYPES.includes(alert_type)) {
    return createApiErrorResponse('BAD_REQUEST', `alert_type must be one of: ${VALID_ALERT_TYPES.join(', ')}`, 400, correlationId);
  }
  if (!delivery_method || !VALID_METHODS.includes(delivery_method)) {
    return createApiErrorResponse('BAD_REQUEST', `delivery_method must be one of: ${VALID_METHODS.join(', ')}`, 400, correlationId);
  }
  if (delivery_method === 'email' && !destination) {
    return createApiErrorResponse('BAD_REQUEST', 'destination (email) is required for email delivery', 400, correlationId);
  }
  if (delivery_method === 'webhook' && !destination) {
    return createApiErrorResponse('BAD_REQUEST', 'destination (URL) is required for webhook delivery', 400, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('alert_subscriptions')
    .insert({
      workspace_id: workspaceId,
      alert_type,
      delivery_method,
      destination: destination || null,
    })
    .select('id, alert_type, delivery_method, destination, enabled, created_at')
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 201 });
}
