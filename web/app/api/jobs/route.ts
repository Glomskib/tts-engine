/**
 * API: Jobs List
 *
 * GET /api/jobs?type=render_video&limit=20 — list jobs, optionally filtered by type/status
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user, isAdmin } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

  let query = supabaseAdmin
    .from('jobs')
    .select('id, type, status, payload, error, attempts, max_attempts, created_at, started_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  // Non-admin users only see their own jobs
  if (!isAdmin) {
    query = query.eq('workspace_id', user.id);
  }

  if (type) {
    query = query.eq('type', type);
  }
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
}, { routeName: '/api/jobs', feature: 'jobs' });
