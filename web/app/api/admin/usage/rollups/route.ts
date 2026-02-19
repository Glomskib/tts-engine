/**
 * GET /api/admin/usage/rollups?from=&to=&group_by=
 *
 * Admin-only. Returns usage rollups for a date range.
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

  const from = searchParams.get('from') || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const to = searchParams.get('to') || new Date().toISOString().slice(0, 10);

  try {
    const { data, error } = await supabaseAdmin
      .from('usage_daily_rollups')
      .select('*')
      .gte('day', from)
      .lte('day', to)
      .order('day', { ascending: false });

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
  } catch (err) {
    console.error('[api/admin/usage/rollups] error:', err);
    return createApiErrorResponse('DB_ERROR', 'Internal server error', 500, correlationId);
  }
}
