import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  try {
    const { id } = await params;
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const now = new Date().toISOString();

    // Mark as read. If id === 'all', mark all unread as read
    if (id === 'all') {
      await supabaseAdmin
        .from('notifications')
        .update({ read: true, is_read: true, read_at: now })
        .eq('user_id', authContext.user.id)
        .eq('read', false);
    } else {
      await supabaseAdmin
        .from('notifications')
        .update({ read: true, is_read: true, read_at: now })
        .eq('id', id)
        .eq('user_id', authContext.user.id);
    }

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  } catch (err) {
    return createApiErrorResponse('INTERNAL', (err as Error).message, 500, correlationId);
  }
}
