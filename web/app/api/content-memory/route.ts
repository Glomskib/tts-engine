/**
 * API: Content Memory
 *
 * GET /api/content-memory — top learned patterns for the workspace
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const url = new URL(request.url);
  const memoryType = url.searchParams.get('type');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

  let query = supabaseAdmin
    .from('content_memory')
    .select('*')
    .eq('workspace_id', user.id)
    .order('performance_score', { ascending: false })
    .limit(limit);

  if (memoryType) {
    query = query.eq('memory_type', memoryType);
  }

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch content memory', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: data || [],
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-memory', feature: 'content-intel' });
