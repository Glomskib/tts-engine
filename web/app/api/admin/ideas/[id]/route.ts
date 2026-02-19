/**
 * GET   /api/admin/ideas/:id       — fetch single idea + artifacts
 * PATCH /api/admin/ideas/:id       — update idea status/mode/priority/tags
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { UpdateIdeaSchema } from '@/lib/command-center/validators';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await params;

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  try {
    const [ideaRes, artifactsRes] = await Promise.all([
      supabaseAdmin.from('ideas').select('*').eq('id', id).single(),
      supabaseAdmin
        .from('idea_artifacts')
        .select('*')
        .eq('idea_id', id)
        .order('ts', { ascending: false }),
    ]);

    if (ideaRes.error) {
      return createApiErrorResponse('NOT_FOUND', 'Idea not found', 404, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: {
        idea: ideaRes.data,
        artifacts: artifactsRes.data || [],
      },
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    console.error('[api/admin/ideas/:id] GET error:', err);
    return createApiErrorResponse('DB_ERROR', 'Internal server error', 500, correlationId);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await params;

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

  const parsed = UpdateIdeaSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.mode !== undefined) updates.mode = parsed.data.mode;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.prompt !== undefined) updates.prompt = parsed.data.prompt;

  if (Object.keys(updates).length === 0) {
    return createApiErrorResponse('BAD_REQUEST', 'No fields to update', 400, correlationId);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('ideas')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[api/admin/ideas/:id] PATCH error:', error);
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    console.error('[api/admin/ideas/:id] PATCH error:', err);
    return createApiErrorResponse('DB_ERROR', 'Internal server error', 500, correlationId);
  }
}
