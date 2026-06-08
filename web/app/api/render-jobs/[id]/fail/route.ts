/**
 * POST /api/render-jobs/[id]/fail
 *
 * Called by the Mac mini render node when a job fails.
 * Authenticated via RENDER_NODE_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { isValidNodeSecret } from '@/lib/render-node-auth';

export const runtime = 'nodejs';

export async function POST(
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

  let body: { error: string; retry?: boolean };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  // Check retry count
  const { data: job } = await supabaseAdmin
    .from('render_jobs')
    .select('retry_count, max_retries')
    .eq('id', id)
    .single();

  const shouldRetry = body.retry !== false &&
    job &&
    job.retry_count < job.max_retries;

  const { error } = await supabaseAdmin
    .from('render_jobs')
    .update({
      status: shouldRetry ? 'queued' : 'failed',
      error: body.error || 'Unknown error',
      progress_message: shouldRetry ? 'Retrying...' : 'Failed',
      node_id: shouldRetry ? null : undefined,
      claimed_at: shouldRetry ? null : undefined,
      started_at: shouldRetry ? null : undefined,
      retry_count: shouldRetry ? (job?.retry_count ?? 0) + 1 : undefined,
    })
    .eq('id', id);

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: { retrying: shouldRetry },
    correlation_id: correlationId,
  });
}
