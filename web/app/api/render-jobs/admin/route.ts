/**
 * GET /api/render-jobs/admin
 *
 * Returns paginated render job list for the admin monitor page.
 * Admin-only endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user || !authCtx.isAdmin) {
    return createApiErrorResponse('UNAUTHORIZED', 'Admin access required', 401, correlationId);
  }

  const params = request.nextUrl.searchParams;
  const status = params.get('status');
  const limit = Math.min(parseInt(params.get('limit') || '50', 10), 200);
  const offset = parseInt(params.get('offset') || '0', 10);

  let query = supabaseAdmin
    .from('render_jobs')
    .select('id, workspace_id, job_type, status, priority, progress_pct, progress_message, node_id, error, retry_count, created_at, claimed_at, started_at, completed_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: data || [],
    correlation_id: correlationId,
  });
}

/**
 * POST /api/render-jobs/admin
 * Admin actions: cancel a job, reprioritize, etc.
 */
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user || !authCtx.isAdmin) {
    return createApiErrorResponse('UNAUTHORIZED', 'Admin access required', 401, correlationId);
  }

  let body: { action: 'cancel' | 'requeue' | 'set_priority'; job_id: string; priority?: number };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  if (body.action === 'cancel') {
    await supabaseAdmin
      .from('render_jobs')
      .update({ status: 'cancelled' })
      .eq('id', body.job_id)
      .in('status', ['queued', 'claimed']);
  } else if (body.action === 'requeue') {
    await supabaseAdmin
      .from('render_jobs')
      .update({ status: 'queued', node_id: null, claimed_at: null, started_at: null, progress_pct: 0, error: null })
      .eq('id', body.job_id)
      .in('status', ['failed', 'cancelled']);
  } else if (body.action === 'set_priority') {
    await supabaseAdmin
      .from('render_jobs')
      .update({ priority: body.priority ?? 5 })
      .eq('id', body.job_id);
  }

  return NextResponse.json({ ok: true, correlation_id: correlationId });
}
