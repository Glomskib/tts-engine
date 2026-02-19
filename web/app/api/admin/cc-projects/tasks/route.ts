/**
 * GET  /api/admin/cc-projects/tasks?project_id=&status=&agent=&limit=
 * POST /api/admin/cc-projects/tasks   — create a task
 * PATCH /api/admin/cc-projects/tasks   — update a task (requires id in body)
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CreateTaskSchema, UpdateTaskSchema } from '@/lib/command-center/validators';
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

  const projectId = searchParams.get('project_id');
  const statusFilter = searchParams.get('status');
  const agentFilter = searchParams.get('agent');
  const limitParam = parseInt(searchParams.get('limit') || '100', 10);
  const limit = Math.min(Math.max(1, limitParam), 500);

  let query = supabaseAdmin
    .from('project_tasks')
    .select('*, cc_projects(name)')
    .order('priority', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (projectId) query = query.eq('project_id', projectId);
  if (statusFilter) query = query.eq('status', statusFilter);
  if (agentFilter) query = query.eq('assigned_agent', agentFilter);
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: data || [],
    count: data?.length ?? 0,
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

  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { data, error } = await supabaseAdmin
    .from('project_tasks')
    .insert({
      project_id: parsed.data.project_id,
      title: parsed.data.title,
      description: parsed.data.description,
      assigned_agent: parsed.data.assigned_agent,
      status: parsed.data.status,
      priority: parsed.data.priority,
      due_at: parsed.data.due_at ?? null,
      meta: parsed.data.meta ?? {},
    })
    .select('*')
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Auto-log creation event
  await logTaskEvent({
    task_id: data.id,
    agent_id: 'admin',
    event_type: 'created',
    payload: { created_by: auth.user.email },
  });

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data,
  }, { status: 201 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

export async function PATCH(request: Request) {
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

  const rawBody = body as Record<string, unknown>;
  const taskId = rawBody?.id as string;
  if (!taskId) {
    return createApiErrorResponse('BAD_REQUEST', 'Task id is required', 400, correlationId);
  }

  const parsed = UpdateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.assigned_agent !== undefined) updates.assigned_agent = parsed.data.assigned_agent;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.due_at !== undefined) updates.due_at = parsed.data.due_at;
  if (parsed.data.sort_order !== undefined) updates.sort_order = parsed.data.sort_order;

  const { data, error } = await supabaseAdmin
    .from('project_tasks')
    .update(updates)
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Log status change if status was updated
  if (parsed.data.status) {
    await logTaskEvent({
      task_id: taskId,
      agent_id: 'admin',
      event_type: 'status_change',
      payload: { new_status: parsed.data.status, updated_by: auth.user.email },
    });
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
