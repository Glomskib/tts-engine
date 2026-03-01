/**
 * POST /api/ri/queue/status
 *
 * Updates the status of a queue item.
 * Body: { id: string, status: RiQueueStatus }
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { updateQueueItemStatus } from '@/lib/revenue-intelligence/actions-queue-service';
import { RI_QUEUE_STATUSES, type RiQueueStatus } from '@/lib/revenue-intelligence/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  const userId = auth.user?.id || process.env.RI_TEST_USER_ID;
  if (!userId) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const { id, status } = body;

  if (!id || typeof id !== 'string') {
    return createApiErrorResponse('BAD_REQUEST', 'id is required', 400, correlationId);
  }
  if (!status || !(RI_QUEUE_STATUSES as readonly string[]).includes(status)) {
    return createApiErrorResponse('BAD_REQUEST', `status must be one of: ${RI_QUEUE_STATUSES.join(', ')}`, 400, correlationId);
  }

  const ok = await updateQueueItemStatus(id, status as RiQueueStatus);

  if (!ok) {
    return createApiErrorResponse('INTERNAL', 'Failed to update queue item status', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
