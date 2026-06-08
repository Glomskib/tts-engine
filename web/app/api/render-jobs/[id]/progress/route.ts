/**
 * PATCH /api/render-jobs/[id]/progress
 *
 * Called by the Mac mini render node to report progress updates.
 * Authenticated via RENDER_NODE_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { isValidNodeSecret } from '@/lib/render-node-auth';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;

  const secret = request.headers.get('x-render-node-secret');
  if (!isValidNodeSecret(secret)) {
    return createApiErrorResponse('UNAUTHORIZED', 'Invalid render node secret', 401, correlationId);
  }

  // A malformed id (e.g. the literal string "null") must never reach the DB:
  // an invalid-uuid query 500s, and under the worker's retry loop that became a
  // multiple-times-per-second 500 storm. Reject it cheaply instead.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return createApiErrorResponse('BAD_REQUEST', `Invalid job id: ${id}`, 400, correlationId);
  }

  let body: { progress_pct: number; progress_message?: string; node_id?: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const updateData: Record<string, unknown> = {
    progress_pct: Math.min(100, Math.max(0, body.progress_pct ?? 0)),
    status: 'processing',
  };

  if (body.progress_message !== undefined) {
    updateData.progress_message = body.progress_message;
  }

  // Set started_at on first progress report
  const { data: existing } = await supabaseAdmin
    .from('render_jobs')
    .select('started_at')
    .eq('id', id)
    .single();

  if (existing && !existing.started_at) {
    updateData.started_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from('render_jobs')
    .update(updateData)
    .eq('id', id);

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, correlation_id: correlationId });
}
