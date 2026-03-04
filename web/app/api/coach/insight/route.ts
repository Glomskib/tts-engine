/**
 * API: Coach Insight
 *
 * GET /api/coach/insight — returns a single daily AI coach insight
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { generateCoachInsight } from '@/lib/ai/coach/generateCoachInsight';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const insight = await generateCoachInsight(user.id);

  const response = NextResponse.json({
    ok: true,
    data: insight,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  response.headers.set('Cache-Control', 'private, max-age=86400');
  return response;
}, { routeName: '/api/coach/insight', feature: 'ai-coach' });
