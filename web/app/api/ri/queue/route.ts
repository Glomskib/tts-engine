/**
 * GET /api/ri/queue
 *
 * Returns queued actions for the authenticated user.
 * Query params: status (optional), limit (default 20, max 100), offset (default 0)
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getQueueItems } from '@/lib/revenue-intelligence/actions-queue-service';
import { RI_QUEUE_STATUSES, type RiQueueStatus } from '@/lib/revenue-intelligence/types';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  const userId = auth.user?.id || process.env.RI_TEST_USER_ID;
  if (!userId) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status') as RiQueueStatus | null;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
  const offset = Number(url.searchParams.get('offset')) || 0;

  if (statusParam && !(RI_QUEUE_STATUSES as readonly string[]).includes(statusParam)) {
    return createApiErrorResponse('BAD_REQUEST', `Invalid status. Must be one of: ${RI_QUEUE_STATUSES.join(', ')}`, 400, correlationId);
  }

  const items = await getQueueItems(userId, statusParam ?? undefined, limit, offset);

  const response = NextResponse.json({
    ok: true,
    items,
    ts: new Date().toISOString(),
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
