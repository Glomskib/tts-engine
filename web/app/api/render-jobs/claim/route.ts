/**
 * POST /api/render-jobs/claim
 *
 * Called by the Mac mini render node to atomically claim the next queued job.
 * Authenticated via RENDER_NODE_SECRET header.
 *
 * Returns the claimed job (with full payload) or 204 if queue is empty.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

const RENDER_NODE_SECRET = process.env.RENDER_NODE_SECRET;

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  // Auth via shared secret header
  const secret = request.headers.get('x-render-node-secret');
  if (!RENDER_NODE_SECRET || secret !== RENDER_NODE_SECRET) {
    return createApiErrorResponse('UNAUTHORIZED', 'Invalid render node secret', 401, correlationId);
  }

  let body: { node_id: string; job_types?: string[] };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  if (!body.node_id) {
    return createApiErrorResponse('BAD_REQUEST', 'node_id required', 400, correlationId);
  }

  const jobTypes = body.job_types || ['clip_render'];

  // Use Postgres function for atomic claim (FOR UPDATE SKIP LOCKED)
  const { data, error } = await supabaseAdmin
    .rpc('claim_render_job', {
      p_node_id: body.node_id,
      p_job_types: jobTypes,
    });

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // No jobs available
  if (!data) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({
    ok: true,
    data,
    correlation_id: correlationId,
  });
}
