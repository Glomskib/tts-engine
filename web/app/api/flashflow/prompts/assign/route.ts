/**
 * POST /api/flashflow/prompts/assign
 * Activate a prompt version for a template. Admin-only.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { assignVersion } from '@/lib/flashflow/prompt-registry';

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

  const { template_id, active_version_id, rollout_strategy, rollout_percent } =
    body as Record<string, unknown>;

  if (!template_id || typeof template_id !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'template_id is required', 400, correlationId);
  }
  if (!active_version_id || typeof active_version_id !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'active_version_id is required', 400, correlationId);
  }

  // Verify version belongs to the template
  const { data: ver, error: verErr } = await supabaseAdmin
    .from('ff_prompt_versions')
    .select('id, template_id')
    .eq('id', active_version_id)
    .single();

  if (verErr || !ver) {
    return createApiErrorResponse('NOT_FOUND', 'Version not found', 404, correlationId);
  }
  if (ver.template_id !== template_id) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'Version does not belong to the specified template',
      400,
      correlationId,
    );
  }

  const validStrategies = ['all', 'percent', 'by_user', 'by_lane'] as const;
  const strategy = typeof rollout_strategy === 'string' && validStrategies.includes(rollout_strategy as typeof validStrategies[number])
    ? (rollout_strategy as typeof validStrategies[number])
    : undefined;

  const percent = typeof rollout_percent === 'number' && rollout_percent >= 0 && rollout_percent <= 100
    ? rollout_percent
    : undefined;

  const assignment = await assignVersion({
    template_id,
    active_version_id,
    rollout_strategy: strategy,
    rollout_percent: percent,
  });

  if (!assignment) {
    return createApiErrorResponse('DB_ERROR', 'Failed to assign version', 500, correlationId);
  }

  const res = NextResponse.json(
    { ok: true, data: assignment, correlation_id: correlationId },
    { status: 200 },
  );
  res.headers.set('x-correlation-id', correlationId);
  return res;
}
