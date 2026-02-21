/**
 * PATCH /api/flashflow/generations/:id
 * Update a generation record (status, output, etc.).
 * Admin-only.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { updateGeneration } from '@/lib/flashflow/generations';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const allowedFields = ['status', 'output_text', 'output_json', 'latency_ms', 'token_count'] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      update[key] = body[key];
    }
  }

  if (Object.keys(update).length === 0) {
    return createApiErrorResponse('BAD_REQUEST', 'No valid fields to update', 400, correlationId);
  }

  const row = await updateGeneration(id, update);

  if (!row) {
    return createApiErrorResponse('NOT_FOUND', 'Generation not found or update failed', 404, correlationId);
  }

  const res = NextResponse.json({ ok: true, data: row, correlation_id: correlationId });
  res.headers.set('x-correlation-id', correlationId);
  return res;
}
