import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * GET /api/calendar?start=2026-02-09&end=2026-03-01
 * Also supports: ?month=2026-02 (legacy)
 * Get all scheduled content for a date range
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { searchParams } = new URL(request.url);
    let startDate = searchParams.get('start');
    let endDate = searchParams.get('end');

    // Legacy month support
    if (!startDate || !endDate) {
      const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
      startDate = `${month}-01`;
      endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);
    }

    // Fetch all videos for this range with a scheduled_date
    const { data: videos, error } = await supabaseAdmin
      .from('videos')
      .select(`
        id,
        title,
        video_code,
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
    const statusCounts: Record<string, number> = {};

    for (const video of videos || []) {
      const date = video.scheduled_date;
      if (!date) continue;
      if (!calendar[date]) calendar[date] = [];

      const rs = video.recording_status || 'UNKNOWN';
      statusCounts[rs] = (statusCounts[rs] || 0) + 1;

      calendar[date].push({
        id: video.id,
        title: video.title,
        video_code: video.video_code,
        status: video.status,
        recording_status: rs,
        scheduled_date: video.scheduled_date,
        product_name: (video.product as any)?.name || null,
        product_brand: (video.product as any)?.brand || null,
        account_name: (video.account as any)?.name || null,
        account_handle: (video.account as any)?.handle || null,
      });
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        start: startDate,
        end: endDate,
        calendar,
        total: videos?.length || 0,
        status_counts: statusCounts,
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

/**
 * PATCH /api/calendar
 * Reschedule a video: move to a different date
 * Body: { video_id: string, scheduled_date: string (YYYY-MM-DD) | null }
 */
export async function PATCH(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const { video_id, scheduled_date } = body;

    if (!video_id) {
      return createApiErrorResponse('BAD_REQUEST', 'video_id is required', 400, correlationId);
    }

    // Validate date format if provided
    if (scheduled_date && !/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date)) {
      return createApiErrorResponse('BAD_REQUEST', 'scheduled_date must be YYYY-MM-DD format', 400, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from('videos')
      .update({ scheduled_date: scheduled_date || null })
      .eq('id', video_id)
      .select('id, scheduled_date')
      .single();

    if (error) {
      console.error(`[${correlationId}] Error rescheduling video:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to reschedule video', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Calendar PATCH error:`, error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Internal server error',
      500,
      correlationId
    );
  }
}
