/**
 * GET /api/admin/usage/events?from=&to=&provider=&model=&agent_id=&limit=
 *
 * Admin-only. Raw usage event listing with filters.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const provider = searchParams.get('provider');
  const model = searchParams.get('model');
  const agentId = searchParams.get('agent_id');
  const limitParam = parseInt(searchParams.get('limit') || '200', 10);
  const limit = Math.min(Math.max(1, limitParam), 500);

  let query = supabaseAdmin
    .from('usage_events')
    .select('*')
    .order('ts', { ascending: false });

  if (from) query = query.gte('ts', `${from}T00:00:00Z`);
  if (to) query = query.lte('ts', `${to}T23:59:59Z`);
  if (provider) query = query.eq('provider', provider);
  if (model) query = query.eq('model', model);
  if (agentId) query = query.eq('agent_id', agentId);
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
