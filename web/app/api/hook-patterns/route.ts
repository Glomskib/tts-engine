/**
 * API: Hook Patterns
 *
 * GET /api/hook-patterns — list hook patterns for workspace
 *   ?limit=50        max results (default 50, max 100)
 *   ?min_score=0     minimum performance_score filter
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
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const minScore = parseFloat(url.searchParams.get('min_score') || '0');

  let query = supabaseAdmin
    .from('hook_patterns')
    .select('id, pattern, example_hook, performance_score, uses_count, source_post_id, created_at')
    .eq('workspace_id', user.id)
    .order('performance_score', { ascending: false })
    .limit(limit);

  if (minScore > 0) {
    query = query.gte('performance_score', minScore);
  }

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch hook patterns', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: data || [],
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/hook-patterns', feature: 'content-intel' });
