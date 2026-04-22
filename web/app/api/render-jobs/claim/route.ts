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

  // Hard-coded allowlist: local workers can ONLY process clip_render jobs.
  // shotstack_timeline jobs require video-asset support and must go to Shotstack.
  // We intentionally ignore any caller-supplied job_types that include other kinds.
  const requestedTypes = body.job_types || ['clip_render'];
  const jobTypes = requestedTypes.filter((t) => t === 'clip_render');
  if (jobTypes.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

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

  // Defensive post-claim guard: if the RPC handed us a job whose kind isn't
  // in the allowlist (e.g. legacy migration that ignores p_job_types), release
  // it back to pending so Shotstack can pick it up. This is the hard guarantee
  // that Mac mini workers NEVER execute shotstack_timeline rows.
  const claimedKind = (data as { kind?: string } | null)?.kind;
  const claimedId = (data as { id?: string } | null)?.id;
  if (claimedKind && !(jobTypes as string[]).includes(claimedKind) && claimedId) {
    console.warn('[render-claim] releasing mis-claimed job', { id: claimedId, kind: claimedKind, node: body.node_id });
    await supabaseAdmin
      .from('ff_render_jobs')
      .update({
        status: 'pending',
        assigned_node_id: null,
        claimed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimedId);
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({
    ok: true,
    data,
    correlation_id: correlationId,
  });
}
