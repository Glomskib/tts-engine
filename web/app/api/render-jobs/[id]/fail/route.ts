/**
 * POST /api/render-jobs/[id]/fail
 *
 * Called by the Mac mini render node when a job fails.
 * Authenticated via RENDER_NODE_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

const RENDER_NODE_SECRET = process.env.RENDER_NODE_SECRET;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;

  const secret = request.headers.get('x-render-node-secret');
  if (!RENDER_NODE_SECRET || secret !== RENDER_NODE_SECRET) {
    return createApiErrorResponse('UNAUTHORIZED', 'Invalid render node secret', 401, correlationId);
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
