import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * GET /api/winners/export
 * Export winners bank as CSV.
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { data: winners, error } = await supabaseAdmin
      .from('winners_bank')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    // Build CSV
    const headers = ['id', 'hook', 'video_url', 'source_type', 'view_count', 'like_count', 'share_count', 'notes', 'patterns', 'created_at'];
    const rows = (winners || []).map((w: any) => {
      return headers.map(h => {
        const val = w[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Escape CSV fields
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="winners-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        'x-correlation-id': correlationId,
      },
    });
  } catch (err) {
    return createApiErrorResponse('INTERNAL', (err as Error).message, 500, correlationId);
  }
}
