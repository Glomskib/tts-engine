/**
 * API: Content Intelligence
 *
 * GET /api/intelligence — analyze content patterns and performance
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { analyzeContent } from '@/lib/content-intelligence/analyzeContent';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const intelligence = await analyzeContent(user.id);

  const response = NextResponse.json({
    ok: true,
    data: intelligence,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  response.headers.set('Cache-Control', 'private, max-age=1800');
  return response;
}, { routeName: '/api/intelligence', feature: 'content-intelligence' });
