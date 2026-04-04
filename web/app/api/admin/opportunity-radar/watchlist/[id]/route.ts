/**
 * API: Opportunity Radar — Single Watchlist Entry
 *
 * GET    /api/admin/opportunity-radar/watchlist/[id]  — entry + observations
 * PATCH  /api/admin/opportunity-radar/watchlist/[id]  — update entry
 * DELETE /api/admin/opportunity-radar/watchlist/[id]  — delete (cascades)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);

  const { data: entry, error } = await supabaseAdmin
    .from('creator_watchlist')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single();

  if (error || !entry) {
    return createApiErrorResponse('NOT_FOUND', 'Watchlist entry not found', 404, correlationId);
  }

  // Fetch observations
  const { data: observations } = await supabaseAdmin
    .from('creator_product_observations')
    .select('*')
    .eq('creator_id', id)
    .eq('workspace_id', workspaceId)
    .order('first_seen_at', { ascending: false });

  return NextResponse.json({
    ok: true,
    data: { ...entry, observations: observations || [] },
    correlation_id: correlationId,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const body = await request.json();

  const allowedFields = [
    'handle', 'platform', 'display_name', 'niche', 'follower_count',
    'priority', 'notes', 'tags', 'avatar_url', 'source', 'is_active',
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return createApiErrorResponse('BAD_REQUEST', 'No valid fields to update', 400, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('creator_watchlist')
    .update(updates)
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select()
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }
  if (!data) {
    return createApiErrorResponse('NOT_FOUND', 'Watchlist entry not found', 404, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);

  // CASCADE on creator_product_observations → opportunities will handle cleanup
  const { error } = await supabaseAdmin
    .from('creator_watchlist')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId);

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, correlation_id: correlationId });
}
