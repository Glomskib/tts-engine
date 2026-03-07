import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Verify content item belongs to this workspace
  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .maybeSingle();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  const { data: events, error } = await supabaseAdmin
    .from('content_item_events')
    .select('*')
    .eq('content_item_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error(`[${correlationId}] content_item_events fetch error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch events', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: events || [],
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/events', feature: 'content-items' });
