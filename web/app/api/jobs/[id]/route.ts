/**
 * GET /api/jobs/[id]
 *
 * Check status of a background job.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { id } = await params;

  const { data: job, error } = await supabaseAdmin
    .from('jobs')
    .select('id, type, status, attempts, max_attempts, result, error, created_at, started_at, completed_at')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (error || !job) {
    return createApiErrorResponse('NOT_FOUND', 'Job not found', 404, correlationId);
  }

  return NextResponse.json({ ok: true, data: job, correlation_id: correlationId });
}
