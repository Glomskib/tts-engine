/**
 * GET    /api/admin/crm/pipelines/:id — pipeline detail + analytics
 * PATCH  /api/admin/crm/pipelines/:id — update pipeline
 * DELETE /api/admin/crm/pipelines/:id — delete pipeline
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { UpdatePipelineSchema } from '@/lib/command-center/crm-validators';
import { getPipelineAnalytics } from '@/lib/command-center/crm-queries';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await context.params;

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const { data: pipeline, error } = await supabaseAdmin
    .from('crm_pipelines')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !pipeline) {
    return createApiErrorResponse('NOT_FOUND', 'Pipeline not found', 404, correlationId);
  }

  const analytics = await getPipelineAnalytics(id);

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: { ...pipeline, analytics },
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await context.params;

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = UpdatePipelineSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.stages !== undefined) updates.stages = parsed.data.stages;
  if (parsed.data.initiative_id !== undefined) updates.initiative_id = parsed.data.initiative_id;

  const { data, error } = await supabaseAdmin
    .from('crm_pipelines')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await context.params;

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const { error } = await supabaseAdmin
    .from('crm_pipelines')
    .delete()
    .eq('id', id);

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
