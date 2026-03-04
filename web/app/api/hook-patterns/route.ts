/**
 * API: Hook Patterns
 *
 * GET /api/hook-patterns — list top hook patterns for workspace
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { fetchTopHookPatterns } from '@/lib/content-intelligence/hookExtractor';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const hooks = await fetchTopHookPatterns(user.id, 10);

  const response = NextResponse.json({
    ok: true,
    data: hooks,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/hook-patterns', feature: 'content-intel' });
