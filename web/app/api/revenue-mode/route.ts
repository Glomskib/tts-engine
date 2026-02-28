/**
 * GET /api/revenue-mode
 *
 * Returns high-intent comments for the Revenue Mode inbox.
 * Filters to buying_intent + objection with lead_score >= 70.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getRevenueModeInbox } from '@/lib/revenue-intelligence/revenue-inbox-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Use authenticated user's ID, with env fallback for dev/testing
  const userId = auth.user.id || process.env.RI_TEST_USER_ID;
  if (!userId) {
    return createApiErrorResponse('BAD_REQUEST', 'No user ID available', 400, correlationId);
  }

  const items = await getRevenueModeInbox({ userId });

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: items,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
