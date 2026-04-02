/**
 * GET /api/footage/[id]/events — audit trail for a footage item
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  // Verify ownership
  const { data: item } = await supabaseAdmin
    .from('footage_items')
    .select('workspace_id')
    .eq('id', id)
    .single();

  if (!item) return createApiErrorResponse('NOT_FOUND', 'Footage item not found', 404, correlationId);
  if (!authCtx.isAdmin && item.workspace_id !== authCtx.user.id) {
    return createApiErrorResponse('FORBIDDEN', 'Access denied', 403, correlationId);
  }

  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100', 10);

  const { data: events } = await supabaseAdmin
    .from('footage_events')
    .select('*')
    .eq('footage_item_id', id)
    .order('created_at', { ascending: false })
    .limit(limit);

  return NextResponse.json({ ok: true, data: events || [], correlation_id: correlationId });
}
