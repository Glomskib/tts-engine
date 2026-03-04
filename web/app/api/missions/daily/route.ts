/**
 * API: Daily Mission
 *
 * GET /api/missions/daily — returns today's mission for the authenticated workspace
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { generateDailyMission } from '@/lib/ai/missions/generateDailyMission';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const mission = await generateDailyMission(user.id);

  const response = NextResponse.json({
    ok: true,
    data: mission,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  response.headers.set('Cache-Control', 'private, max-age=300');
  return response;
}, { routeName: '/api/missions/daily', feature: 'daily-mission' });
