/**
 * API: Editor Notes for content items
 *
 * GET  /api/content-items/[id]/editor-notes — Return saved editor notes
 * POST /api/content-items/[id]/editor-notes — Enqueue generation job
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { enqueueJob } from '@/lib/jobs';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  const correlationId = generateCorrelationId();
  const { id } = await context.params;
  const { user } = await getApiAuthContext(request);

  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('content_items')
    .select('editor_notes_json, editor_notes_text, editor_notes_status, editor_notes_error')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (error || !data) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: {
      status: data.editor_notes_status || 'none',
      json: data.editor_notes_json,
      markdown: data.editor_notes_text,
      error: data.editor_notes_error,
    },
    correlation_id: correlationId,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  const correlationId = generateCorrelationId();
  const { id } = await context.params;
  const { user } = await getApiAuthContext(request);

  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Verify item exists and has transcript
  const { data: item, error } = await supabaseAdmin
    .from('content_items')
    .select('id, transcript_text, editor_notes_status')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (error || !item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  if (!item.transcript_text) {
    return createApiErrorResponse('BAD_REQUEST', 'Save a transcript first before generating editor notes', 400, correlationId);
  }

  // Enqueue job
  const jobId = await enqueueJob(user.id, 'generate_editor_notes', {
    content_item_id: id,
  });

  if (!jobId) {
    return createApiErrorResponse('DB_ERROR', 'Failed to enqueue editor notes job', 500, correlationId);
  }

  // Mark as pending
  await supabaseAdmin
    .from('content_items')
    .update({ editor_notes_status: 'pending', editor_notes_error: null })
    .eq('id', id);

  return NextResponse.json({
    ok: true,
    data: {
      job_id: jobId,
      status: 'pending',
    },
    correlation_id: correlationId,
  });
}
