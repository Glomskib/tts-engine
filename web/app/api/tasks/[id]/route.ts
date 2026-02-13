import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

const VALID_STATUSES = ['pending', 'approved', 'in_progress', 'done', 'verified', 'rejected'] as const;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/tasks/[id] — Update task status, add result
 * Auth: Admin session required
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return createApiErrorResponse('INVALID_UUID', 'Invalid task ID', 400, correlationId);
  }

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const { status, result } = body as { status?: string; result?: string };

  if (!status && result === undefined) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Provide status and/or result to update', 400, correlationId);
  }

  if (status && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return createApiErrorResponse('INVALID_STATUS', `status must be one of: ${VALID_STATUSES.join(', ')}`, 400, correlationId);
  }

  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (result !== undefined) updates.result = result;

  const { data, error } = await supabaseAdmin
    .from('agent_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return createApiErrorResponse('NOT_FOUND', 'Task not found', 404, correlationId);
    }
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
