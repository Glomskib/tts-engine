import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * GET /api/notifications/digest
 * Compiles unread notifications into a grouped summary
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data: notifications, error } = await supabaseAdmin
    .from('notifications')
    .select('id, type, title, message, action_url, created_at')
    .eq('user_id', authContext.user.id)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Group by type
  const byType: Record<string, { count: number; latest: string; items: Array<{ title: string | null; message: string | null }> }> = {};
  for (const n of notifications || []) {
    if (!byType[n.type]) {
      byType[n.type] = { count: 0, latest: n.created_at, items: [] };
    }
    byType[n.type].count++;
    if (byType[n.type].items.length < 3) {
      byType[n.type].items.push({ title: n.title, message: n.message });
    }
  }

  // Build summary text
  const lines: string[] = [];
  for (const [type, info] of Object.entries(byType)) {
    const label = type.replace(/_/g, ' ');
    lines.push(`${info.count} ${label}${info.count > 1 ? 's' : ''}`);
  }

  const response = NextResponse.json({
    ok: true,
    data: {
      total_unread: (notifications || []).length,
      summary: lines.length > 0 ? lines.join(', ') : 'No unread notifications',
      by_type: byType,
    },
    correlation_id: correlationId,
  });
  response.headers.set('Cache-Control', 'private, max-age=30');
  return response;
}
