/**
 * POST /api/render-jobs
 *
 * Creates a new render job for the Mac mini render node.
 * Called by Clip Studio after uploading raw clips.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  const userId = authCtx.user.id;

  let body: {
    clip_urls: string[];
    product_id?: string;
    context?: string;
    content_item_id?: string;
    priority?: number;
    settings?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  if (!body.clip_urls?.length) {
    return createApiErrorResponse('BAD_REQUEST', 'clip_urls required', 400, correlationId);
  }

  const { data: job, error } = await supabaseAdmin
    .from('render_jobs')
    .insert({
      workspace_id: userId,
      content_item_id: body.content_item_id || null,
      job_type: 'clip_render',
      status: 'queued',
      priority: body.priority ?? 5,
      payload: {
        clip_urls: body.clip_urls,
        product_id: body.product_id || null,
        context: body.context || null,
        settings: body.settings || {},
      },
    })
    .select('id, status, priority, created_at')
    .single();

  if (error || !job) {
    return createApiErrorResponse('DB_ERROR', error?.message || 'Failed to create render job', 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: { job_id: job.id, status: job.status },
    correlation_id: correlationId,
  });
}

/**
 * GET /api/render-jobs?job_id=xxx
 * Poll status of a specific job.
 */
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  const userId = authCtx.user.id;

  const jobId = request.nextUrl.searchParams.get('job_id');
  if (!jobId) {
    return createApiErrorResponse('BAD_REQUEST', 'job_id required', 400, correlationId);
  }

  const { data: job, error } = await supabaseAdmin
    .from('render_jobs')
    .select('id, status, progress_pct, progress_message, result, error, node_id, claimed_at, started_at, completed_at, created_at')
    .eq('id', jobId)
    .eq('workspace_id', userId)
    .single();

  if (error || !job) {
    return createApiErrorResponse('NOT_FOUND', 'Job not found', 404, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: job,
    correlation_id: correlationId,
  });
}
