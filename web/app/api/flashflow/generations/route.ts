/**
 * POST /api/flashflow/generations
 * Create a new generation record.
 * Admin-only or service-role writes.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { logGeneration } from '@/lib/flashflow/generations';

export const runtime = 'nodejs';

export async function POST(request: Request) {
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

  const { template_id, prompt_version, inputs_json, output_text, output_json, model, latency_ms, token_count, status, user_id } = body as Record<string, unknown>;

  if (!template_id || typeof template_id !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'template_id is required', 400, correlationId);
  }

  const row = await logGeneration({
    user_id: (typeof user_id === 'string' ? user_id : auth.user.id),
    template_id,
    prompt_version: typeof prompt_version === 'string' ? prompt_version : undefined,
    inputs_json: (inputs_json as Record<string, unknown>) ?? undefined,
    output_text: typeof output_text === 'string' ? output_text : undefined,
    output_json: (output_json as Record<string, unknown>) ?? undefined,
    model: typeof model === 'string' ? model : undefined,
    latency_ms: typeof latency_ms === 'number' ? latency_ms : undefined,
    token_count: typeof token_count === 'number' ? token_count : undefined,
    status: (typeof status === 'string' ? status : 'completed') as 'completed',
    correlation_id: correlationId,
  });

  if (!row) {
    return createApiErrorResponse('DB_ERROR', 'Failed to create generation', 500, correlationId);
  }

  const res = NextResponse.json({ ok: true, data: row, correlation_id: correlationId }, { status: 201 });
  res.headers.set('x-correlation-id', correlationId);
  return res;
}
