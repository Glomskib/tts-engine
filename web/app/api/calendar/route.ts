import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * GET /api/calendar?month=2026-02
 * Get all content for a specific month
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7); // YYYY-MM

    // Calculate date range for the month
    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    // Fetch all videos for this month (scheduled or posted)
    const { data: videos, error } = await supabaseAdmin
      .from('videos')
      .select(`
        id,
        title,
        status,
        recording_status,
        scheduled_date,
        scheduled_account_id,
        created_at,
        product:product_id(id,name,brand),
        account:scheduled_account_id(id,name,handle)
      `)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date', { ascending: true });

    if (error) {
      console.error(`[${correlationId}] Error fetching calendar:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to fetch calendar', 500, correlationId);
    }

    // Group by date
    const calendar: Record<string, any[]> = {};
    for (const video of videos || []) {
      const date = video.scheduled_date || video.created_at?.slice(0, 10);
      if (!date) continue;
      if (!calendar[date]) calendar[date] = [];
      calendar[date].push({
        id: video.id,
        title: video.title,
        status: video.status,
        recording_status: video.recording_status,
        product_name: (video.product as any)?.name || null,
        account_name: (video.account as any)?.name || null,
        account_handle: (video.account as any)?.handle || null,
      });
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        month,
        calendar,
        total: videos?.length || 0,
      },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Calendar GET error:`, error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Internal server error',
      500,
      correlationId
    );
  }
}
