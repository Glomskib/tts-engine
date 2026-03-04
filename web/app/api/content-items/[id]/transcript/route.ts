/**
 * API: Manual Transcript Ingest for content items
 *
 * POST /api/content-items/[id]/transcript
 * Body: { transcript_text: string, transcript_json?: any, source?: "manual"|"api", raw_drive_file_id?: string }
 *
 * Saves transcript data directly to the content item.
 * Sets raw_footage_received_at when raw_drive_file_id or transcript provided.
 * Designed for manual paste now, external API later.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { z } from 'zod';

export const runtime = 'nodejs';

const TranscriptSchema = z.object({
  transcript_text: z.string().min(1, 'Transcript text is required'),
  transcript_json: z.any().optional(),
  source: z.enum(['manual', 'api']).optional().default('manual'),
  raw_drive_file_id: z.string().optional(),
});

export const POST = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);

  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = TranscriptSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('content_items')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!existing) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  // Build update payload
  const updateData: Record<string, unknown> = {
    transcript_text: parsed.data.transcript_text,
    transcript_status: 'completed',
    transcript_error: null,
  };

  if (parsed.data.transcript_json !== undefined) {
    updateData.transcript_json = parsed.data.transcript_json;
  }

  if (parsed.data.raw_drive_file_id) {
    updateData.raw_footage_drive_file_id = parsed.data.raw_drive_file_id;
    updateData.last_processed_raw_file_id = parsed.data.raw_drive_file_id;
  }

  // Set raw_footage_received_at if we have raw file or transcript
  updateData.raw_footage_received_at = new Date().toISOString();

  const { data: updated, error } = await supabaseAdmin
    .from('content_items')
    .update(updateData)
    .eq('id', id)
    .select('id, transcript_text, transcript_status, raw_footage_drive_file_id, raw_footage_received_at')
    .single();

  if (error) {
    console.error(`[${correlationId}] transcript update error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to save transcript', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: updated,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/transcript', feature: 'transcript-ingest' });

/**
 * GET /api/content-items/[id]/transcript
 * Returns transcript data for this content item.
 */
export const GET = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);

  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data: item, error } = await supabaseAdmin
    .from('content_items')
    .select('id, transcript_text, transcript_json, transcript_status, transcript_error, raw_footage_drive_file_id, raw_footage_url, raw_footage_received_at')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (error || !item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: item,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/transcript', feature: 'transcript-ingest' });
