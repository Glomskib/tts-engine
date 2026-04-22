import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(req);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const url = new URL(req.url);
  const platform = url.searchParams.get('platform');
  const status = url.searchParams.get('status');
  const eventId = url.searchParams.get('event_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

  let query = supabaseAdmin
    .from('ad_conversion_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (platform) query = query.eq('platform', platform);
  if (status) query = query.eq('status', status);
  if (eventId) query = query.eq('event_id', eventId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: 'DB_ERROR', message: error.message, correlation_id: correlationId },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: { rows: data || [], count: data?.length || 0 },
  });
}
