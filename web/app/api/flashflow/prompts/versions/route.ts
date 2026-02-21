/**
 * POST /api/flashflow/prompts/versions
 * Create a new prompt version (always draft). Admin-only.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createVersion } from '@/lib/flashflow/prompt-registry';

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

  const { template_id, system_prompt, developer_prompt, user_prompt_template, guardrails_json, scoring_rubric_json } =
    body as Record<string, unknown>;

  if (!template_id || typeof template_id !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'template_id is required', 400, correlationId);
  }

  // Verify template exists
  const { data: tmpl, error: tmplErr } = await supabaseAdmin
    .from('ff_prompt_templates')
    .select('id')
    .eq('id', template_id)
    .single();

  if (tmplErr || !tmpl) {
    return createApiErrorResponse('NOT_FOUND', 'Template not found', 404, correlationId);
  }

  const version = await createVersion({
    template_id,
    system_prompt: typeof system_prompt === 'string' ? system_prompt : undefined,
    developer_prompt: typeof developer_prompt === 'string' ? developer_prompt : undefined,
    user_prompt_template: typeof user_prompt_template === 'string' ? user_prompt_template : undefined,
    guardrails_json: guardrails_json as Record<string, unknown> | undefined,
    scoring_rubric_json: scoring_rubric_json as Record<string, unknown> | undefined,
    created_by: auth.user.email ?? undefined,
  });

  if (!version) {
    return createApiErrorResponse('DB_ERROR', 'Failed to create version', 500, correlationId);
  }

  const res = NextResponse.json(
    { ok: true, data: version, correlation_id: correlationId },
    { status: 201 },
  );
  res.headers.set('x-correlation-id', correlationId);
  return res;
}
