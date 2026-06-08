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
import { isValidNodeSecret } from '@/lib/render-node-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  // Auth via shared secret header (accepts RENDER_NODE_SECRET or RENDER_NODE_SECRET_PUBLIC).
  const secret = request.headers.get('x-render-node-secret');
  if (!isValidNodeSecret(secret)) {
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

  // Normalize: the claim RPC may return a single composite row or (defensively)
  // a single-element array. A "claim" with no usable id is treated as no job,
  // so the worker idles cleanly instead of looping on /api/render-jobs/null/* —
  // which is what produced the 24/7 PATCH .../null/progress 500 storm.
  const claimed = (Array.isArray(data) ? data[0] : data) as (Record<string, unknown> | null);
  if (!claimed || !claimed.id) {
    return new NextResponse(null, { status: 204 });
  }

  // Defensive post-claim guard: if the RPC handed us a job whose kind isn't
  // in the allowlist (e.g. legacy migration that ignores p_job_types), release
  // it back to pending so Shotstack can pick it up. This is the hard guarantee
  // that Mac mini workers NEVER execute shotstack_timeline rows.
  const claimedKind = (claimed as { kind?: string }).kind;
  const claimedId = (claimed as { id?: string }).id;
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

  // Expose the job id at the top level AND under job/data so the worker reads
  // it however it was written. The old shape only nested it under `data`,
  // which is the most likely source of the literal "null" id in the logs.
  return NextResponse.json({
    ok: true,
    id: claimed.id,
    job: claimed,
    data: claimed,
    correlation_id: correlationId,
  });
}
