/**
 * API: Opportunity Radar — Ingest Observations
 *
 * POST /api/admin/opportunity-radar/ingest-observations
 *
 * Single entry point for automated observation ingestion (OpenClaw, scrapers, etc.).
 * Handles dedup, change detection, scoring, and opportunity creation.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';
import { ingestObservation, ingestBatch } from '@/lib/opportunity-radar/ingestion';
import type { IngestObservationInput } from '@/lib/opportunity-radar/ingestion';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const body = await request.json();

  const { creator_id, creator_source_id, observations } = body as {
    creator_id?: string;
    creator_source_id?: string;
    observations?: IngestObservationInput[];
  };

  if (!creator_id?.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'creator_id is required', 400, correlationId);
  }

  // Verify the creator belongs to this workspace
  const { data: creator, error: creatorErr } = await supabaseAdmin
    .from('creator_watchlist')
    .select('id')
    .eq('id', creator_id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (creatorErr || !creator) {
    return createApiErrorResponse('NOT_FOUND', 'Creator not found in your watchlist', 404, correlationId);
  }

  // Single observation
  if (!observations || !Array.isArray(observations)) {
    const input = body as IngestObservationInput & { creator_id: string; creator_source_id?: string };
    if (!input.product_name?.trim()) {
      return createApiErrorResponse('BAD_REQUEST', 'product_name is required', 400, correlationId);
    }

    try {
      const result = await ingestObservation(workspaceId, creator_id, input, creator_source_id);
      return NextResponse.json({ ok: true, ...result, correlation_id: correlationId });
    } catch (err) {
      return createApiErrorResponse(
        'INTERNAL',
        err instanceof Error ? err.message : 'Ingestion failed',
        500,
        correlationId,
      );
    }
  }

  // Batch observations
  if (observations.length === 0) {
    return createApiErrorResponse('BAD_REQUEST', 'observations array is empty', 400, correlationId);
  }

  if (observations.length > 100) {
    return createApiErrorResponse('BAD_REQUEST', 'Maximum 100 observations per batch', 400, correlationId);
  }

  try {
    const result = await ingestBatch(workspaceId, creator_id, observations, creator_source_id);
    return NextResponse.json({ ok: true, ...result, correlation_id: correlationId });
  } catch (err) {
    return createApiErrorResponse(
      'INTERNAL',
      err instanceof Error ? err.message : 'Batch ingestion failed',
      500,
      correlationId,
    );
  }
}
