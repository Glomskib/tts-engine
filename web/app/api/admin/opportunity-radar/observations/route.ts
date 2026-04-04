/**
 * API: Opportunity Radar — Observations
 *
 * GET  /api/admin/opportunity-radar/observations   — list with creator data
 * POST /api/admin/opportunity-radar/observations   — create + auto-score
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';
import { computeOpportunityScore } from '@/lib/opportunity-radar/scoring';
import type { ObservationConfidence, CreatorPriority } from '@/lib/opportunity-radar/types';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const url = new URL(request.url);
  const creatorId = url.searchParams.get('creator_id');
  const creatorHasPosted = url.searchParams.get('creator_has_posted');
  const confidence = url.searchParams.get('confidence');
  const productName = url.searchParams.get('product_name');

  let query = supabaseAdmin
    .from('creator_product_observations')
    .select('*, creator:creator_id(id, handle, display_name, platform, priority, niche)')
    .eq('workspace_id', workspaceId)
    .order('first_seen_at', { ascending: false });

  if (creatorId) query = query.eq('creator_id', creatorId);
  if (creatorHasPosted !== null && creatorHasPosted !== undefined && creatorHasPosted !== '') {
    query = query.eq('creator_has_posted', creatorHasPosted === 'true');
  }
  if (confidence) query = query.eq('confidence', confidence);
  if (productName) query = query.ilike('product_name', `%${productName}%`);

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
  const {
    creator_id, product_name, product_url, product_image_url,
    brand_name, product_id, source_label, confidence,
    observation_notes, source, creator_has_posted,
  } = body;

  if (!creator_id?.trim() || !product_name?.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'creator_id and product_name are required', 400, correlationId);
  }

  // Verify creator belongs to workspace
  const { data: creator } = await supabaseAdmin
    .from('creator_watchlist')
    .select('id, priority')
    .eq('id', creator_id)
    .eq('workspace_id', workspaceId)
    .single();

  if (!creator) {
    return createApiErrorResponse('NOT_FOUND', 'Creator not found in watchlist', 404, correlationId);
  }

  const validConfidence: ObservationConfidence[] = ['low', 'medium', 'high', 'confirmed'];
  const confidenceVal = validConfidence.includes(confidence) ? confidence : 'medium';
  const validSources = ['manual', 'import', 'openclaw', 'automation'];
  const sourceVal = source && validSources.includes(source) ? source : 'manual';

  const now = new Date().toISOString();

  const { data: observation, error: obsError } = await supabaseAdmin
    .from('creator_product_observations')
    .insert({
      workspace_id: workspaceId,
      creator_id: creator_id.trim(),
      product_name: product_name.trim(),
      product_url: product_url?.trim() || null,
      product_image_url: product_image_url?.trim() || null,
      brand_name: brand_name?.trim() || null,
      product_id: product_id || null,
      source_label: source_label?.trim() || null,
      confidence: confidenceVal,
      observation_notes: observation_notes?.trim() || null,
      source: sourceVal,
      creator_has_posted: creator_has_posted ?? false,
      first_seen_at: now,
      last_seen_at: now,
      times_seen: 1,
      created_by: authContext.user.id,
    })
    .select()
    .single();

  if (obsError) {
    return createApiErrorResponse('DB_ERROR', obsError.message, 500, correlationId);
  }

  // Count distinct creators with same product_name in this workspace
  const { data: creatorIds } = await supabaseAdmin
    .from('creator_product_observations')
    .select('creator_id')
    .eq('workspace_id', workspaceId)
    .ilike('product_name', product_name.trim())
    .neq('creator_id', creator_id.trim());

  const uniqueOtherCreators = new Set((creatorIds || []).map((r: { creator_id: string }) => r.creator_id));
  const multiCreatorCount = uniqueOtherCreators.size;

  // Score
  const scoreBreakdown = computeOpportunityScore(
    {
      first_seen_at: observation.first_seen_at,
      creator_has_posted: observation.creator_has_posted,
      confidence: observation.confidence as ObservationConfidence,
      times_seen: observation.times_seen,
    },
    creator.priority as CreatorPriority,
    multiCreatorCount,
  );

  // Auto-generate opportunity record
  const { data: opportunity, error: oppError } = await supabaseAdmin
    .from('opportunities')
    .insert({
      workspace_id: workspaceId,
      observation_id: observation.id,
      score: scoreBreakdown.total,
      score_breakdown: scoreBreakdown,
      status: 'new',
    })
    .select()
    .single();

  if (oppError) {
    console.error(`[${correlationId}] Failed to create opportunity:`, oppError);
  }

  return NextResponse.json({
    ok: true,
    data: { observation, opportunity: opportunity || null },
    correlation_id: correlationId,
  }, { status: 201 });
}
