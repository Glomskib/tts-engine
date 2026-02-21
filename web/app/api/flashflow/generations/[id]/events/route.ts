/**
 * POST /api/flashflow/generations/:id/events
 * Log a lifecycle event for a generation.
 * Admin-only.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const VALID_EVENT_TYPES = [
  'viewed', 'edited', 'approved', 'rejected',
  'regenerated', 'posted', 'feedback',
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: generationId } = await params;
  const correlationId =
    request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const { event_type, actor, payload } = body;

  if (!event_type || typeof event_type !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'event_type is required', 400, correlationId);
  }

  if (!VALID_EVENT_TYPES.includes(event_type as typeof VALID_EVENT_TYPES[number])) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      `event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
      400,
      correlationId
    );
  }

  const { data, error } = await supabaseAdmin
    .from('ff_events')
    .insert({
      generation_id: generationId,
      event_type,
      actor: typeof actor === 'string' ? actor : auth.user.email ?? auth.user.id,
      payload: (payload as Record<string, unknown>) ?? {},
    })
    .select()
    .single();

  if (error) {
    // FK violation means generation doesn't exist
    if (error.code === '23503') {
      return createApiErrorResponse('NOT_FOUND', 'Generation not found', 404, correlationId);
    }
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const res = NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 201 });
  res.headers.set('x-correlation-id', correlationId);
  return res;
}
