/**
 * API: Opportunity Radar — Opportunities
 *
 * GET   /api/admin/opportunity-radar/opportunities  — list scored opportunities
 * PATCH /api/admin/opportunity-radar/opportunities  — update status / action
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
  const status = url.searchParams.get('status');
  const minScore = url.searchParams.get('min_score');
  const niche = url.searchParams.get('niche');
  const creatorHasPosted = url.searchParams.get('creator_has_posted');

  let query = supabaseAdmin
    .from('opportunities')
    .select(`
      *,
      observation:observation_id(
        *,
        creator:creator_id(id, handle, display_name, platform, priority, niche)
      )
    `)
    .eq('workspace_id', workspaceId)
    .order('score', { ascending: false });

  if (status) query = query.eq('status', status);
  if (minScore) query = query.gte('score', parseInt(minScore, 10));

  const { data, error } = await query;
  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  let rows = data || [];

  // Post-query filters on nested fields
  if (niche) {
    rows = rows.filter((row: Record<string, unknown>) => {
      const obs = row.observation as Record<string, unknown> | null;
      const creator = obs?.creator as Record<string, unknown> | null;
      return creator?.niche && String(creator.niche).toLowerCase().includes(niche.toLowerCase());
    });
  }
  if (creatorHasPosted !== null && creatorHasPosted !== undefined && creatorHasPosted !== '') {
    const posted = creatorHasPosted === 'true';
    rows = rows.filter((row: Record<string, unknown>) => {
      const obs = row.observation as Record<string, unknown> | null;
      return obs?.creator_has_posted === posted;
    });
  }

  return NextResponse.json({
    ok: true,
    data: rows,
    correlation_id: correlationId,
  });
}

export async function PATCH(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const body = await request.json();
  const { id, status, notes, action_type } = body;

  if (!id) {
    return createApiErrorResponse('BAD_REQUEST', 'id is required', 400, correlationId);
  }

  const validStatuses = ['new', 'reviewed', 'dismissed', 'actioned'];
  if (status && !validStatuses.includes(status)) {
    return createApiErrorResponse('BAD_REQUEST', `status must be one of: ${validStatuses.join(', ')}`, 400, correlationId);
  }

  // Fetch existing opportunity with observation data
  const { data: existing } = await supabaseAdmin
    .from('opportunities')
    .select('*, observation:observation_id(product_name, brand_name)')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single();

  if (!existing) {
    return createApiErrorResponse('NOT_FOUND', 'Opportunity not found', 404, correlationId);
  }

  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  const obs = existing.observation as { product_name: string; brand_name?: string } | null;
  const productName = obs?.product_name || 'Unknown Product';

  // Handle action_type: create linked records
  if (action_type) {
    const validActions = ['content_item', 'experiment', 'research'];
    if (!validActions.includes(action_type)) {
      return createApiErrorResponse('BAD_REQUEST', `action_type must be one of: ${validActions.join(', ')}`, 400, correlationId);
    }

    updates.action_type = action_type;
    updates.status = 'actioned';
    updates.reviewed_by = authContext.user.id;
    updates.reviewed_at = new Date().toISOString();

    if (action_type === 'content_item') {
      const { data: ci, error: ciErr } = await supabaseAdmin
        .from('content_items')
        .insert({
          workspace_id: workspaceId,
          title: `Opportunity: ${productName}`,
          source_type: 'product_research',
          source_ref_id: id,
          status: 'briefing',
          short_id: 'temp',
          created_by: authContext.user.id,
        })
        .select('id')
        .single();

      if (ciErr) {
        return createApiErrorResponse('DB_ERROR', `Failed to create content item: ${ciErr.message}`, 500, correlationId);
      }
      updates.action_ref_id = ci.id;
    } else if (action_type === 'experiment') {
      const { data: exp, error: expErr } = await supabaseAdmin
        .from('experiments')
        .insert({
          workspace_id: workspaceId,
          name: `Test: ${productName}`,
          status: 'draft',
        })
        .select('id')
        .single();

      if (expErr) {
        return createApiErrorResponse('DB_ERROR', `Failed to create experiment: ${expErr.message}`, 500, correlationId);
      }
      updates.action_ref_id = exp.id;
    }
    // research: no linked record needed, just mark actioned
  } else if (status === 'reviewed') {
    updates.reviewed_by = authContext.user.id;
    updates.reviewed_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('opportunities')
    .update(updates)
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select()
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}
