import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { sendTelegramNotification } from '@/lib/telegram';

export const runtime = 'nodejs';

const VALID_TYPES = ['bug_fix', 'feature', 'research', 'content'] as const;
const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
const VALID_STATUSES = ['pending', 'approved', 'in_progress', 'done', 'verified', 'rejected'] as const;

/**
 * POST /api/tasks — Create a new agent task (Bolt writes here)
 * Auth: API key required (Bearer ff_ak_*)
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Valid API key required', 401, correlationId);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const { type, title, prompt, priority, source } = body as {
    type?: string;
    title?: string;
    prompt?: string;
    priority?: string;
    source?: string;
  };

  if (!type || !VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
    return createApiErrorResponse('VALIDATION_ERROR', `type must be one of: ${VALID_TYPES.join(', ')}`, 400, correlationId);
  }
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return createApiErrorResponse('VALIDATION_ERROR', 'title is required', 400, correlationId);
  }
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return createApiErrorResponse('VALIDATION_ERROR', 'prompt is required', 400, correlationId);
  }
  if (priority && !VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
    return createApiErrorResponse('VALIDATION_ERROR', `priority must be one of: ${VALID_PRIORITIES.join(', ')}`, 400, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('agent_tasks')
    .insert({
      type,
      title: title.trim(),
      prompt: prompt.trim(),
      priority: priority || 'medium',
      source: source || 'bolt',
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  sendTelegramNotification(`🔧 New task: ${title.trim()} — ${priority || 'medium'}`);

  const response = NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 201 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

/**
 * GET /api/tasks — List tasks with optional status filter
 * Auth: Admin session required
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

  if (status && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return createApiErrorResponse('VALIDATION_ERROR', `Invalid status filter: ${status}`, 400, correlationId);
  }

  let query = supabaseAdmin
    .from('agent_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
