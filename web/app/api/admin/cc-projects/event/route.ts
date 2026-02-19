/**
 * GET  /api/admin/cc-projects/event?task_id=  — fetch events for a task
 * POST /api/admin/cc-projects/event           — record a task event
 *
 * Admin-only. Record a task event and optionally update task.updated_at.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ProjectEventSchema } from '@/lib/command-center/validators';
import { logTaskEvent } from '@/lib/command-center/ingest';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const taskId = searchParams.get('task_id');
  if (!taskId) {
    return createApiErrorResponse('BAD_REQUEST', 'task_id is required', 400, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('task_events')
    .select('*')
    .eq('task_id', taskId)
    .order('ts', { ascending: false });

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: data || [],
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

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

  const parsed = ProjectEventSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const result = await logTaskEvent({
    task_id: parsed.data.task_id,
    agent_id: parsed.data.agent_id,
    event_type: parsed.data.event_type,
    payload: parsed.data.payload,
  });

  if (!result) {
    return createApiErrorResponse('DB_ERROR', 'Failed to insert task event', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    event_id: result.id,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
