/**
 * POST /api/revenue-mode/status
 *
 * Updates the status of a Revenue Intelligence comment.
 * Body: { commentId: string, status: 'reviewed' | 'resolved' }
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { updateCommentStatus } from '@/lib/revenue-intelligence/revenue-inbox-service';

export const runtime = 'nodejs';

const ALLOWED_STATUSES = ['reviewed', 'resolved'] as const;

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: { commentId?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const { commentId, status } = body;

  if (!commentId || typeof commentId !== 'string') {
    return createApiErrorResponse('BAD_REQUEST', 'commentId is required', 400, correlationId);
  }
  if (!status || !ALLOWED_STATUSES.includes(status as typeof ALLOWED_STATUSES[number])) {
    return createApiErrorResponse('BAD_REQUEST', `status must be one of: ${ALLOWED_STATUSES.join(', ')}`, 400, correlationId);
  }

  const ok = await updateCommentStatus(
    commentId,
    status as 'reviewed' | 'resolved',
    status === 'resolved' ? auth.user.id : undefined,
  );

  if (!ok) {
    return createApiErrorResponse('INTERNAL', 'Failed to update comment status', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
