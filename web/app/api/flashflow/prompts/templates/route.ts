/**
 * POST /api/flashflow/prompts/templates
 * Create a new prompt template. Admin-only.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { createTemplate } from '@/lib/flashflow/prompt-registry';

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

  const { key, title, description, output_schema_json } = body as Record<string, unknown>;

  if (!key || typeof key !== 'string' || !/^[a-zA-Z0-9_]+$/.test(key)) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'key is required and must be alphanumeric with underscores',
      400,
      correlationId,
    );
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return createApiErrorResponse('VALIDATION_ERROR', 'title is required', 400, correlationId);
  }

  const template = await createTemplate({
    key,
    title: title.trim(),
    description: typeof description === 'string' ? description : undefined,
    output_schema_json: output_schema_json as Record<string, unknown> | undefined,
  });

  if (!template) {
    return createApiErrorResponse(
      'CONFLICT',
      'Failed to create template (key may already exist)',
      409,
      correlationId,
    );
  }

  const res = NextResponse.json(
    { ok: true, data: template, correlation_id: correlationId },
    { status: 201 },
  );
  res.headers.set('x-correlation-id', correlationId);
  return res;
}
