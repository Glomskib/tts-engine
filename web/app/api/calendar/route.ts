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
        video_code,
        status,
        recording_status,
        scheduled_date,
        scheduled_time,
        google_drive_url,
        final_video_url,
        scheduled_account_id,
        created_at,
        product:product_id(id,name,brand),
        account:scheduled_account_id(id,name,handle)
      `)
      .eq('client_user_id', authContext.user.id)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date', { ascending: true });

    if (error) {
      console.error(`[${correlationId}] Error fetching calendar:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to fetch calendar', 500, correlationId);
    }

    // Fetch content_items with due_at in range
    const { data: contentItems } = await supabaseAdmin
      .from('content_items')
      .select(`
        id,
        short_id,
        title,
        status,
        due_at,
        brand_id,
        product_id,
        drive_folder_url,
        brief_doc_url,
        final_video_url,
        ai_description,
        hashtags,
        caption,
        editor_notes_status,
        created_at,
        product:product_id(name)
      `)
      .eq('workspace_id', authContext.user.id)
      .gte('due_at', `${startDate}T00:00:00Z`)
      .lte('due_at', `${endDate}T23:59:59Z`)
      .order('due_at', { ascending: true });

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
        type: 'video',
        video_code: video.video_code,
        status: video.status,
        recording_status: rs,
        scheduled_date: video.scheduled_date,
        scheduled_time: video.scheduled_time || null,
        google_drive_url: video.google_drive_url || null,
        final_video_url: video.final_video_url || null,
        product_name: (video.product as any)?.name || null,
        product_brand: (video.product as any)?.brand || null,
        account_name: (video.account as any)?.name || null,
        account_handle: (video.account as any)?.handle || null,
      });
    }

    // Add content items to calendar
    for (const ci of contentItems || []) {
      if (!ci.due_at) continue;
      const date = ci.due_at.slice(0, 10);
      if (!calendar[date]) calendar[date] = [];

      calendar[date].push({
        id: ci.id,
        type: 'content_item',
        short_id: ci.short_id,
        title: ci.title,
        status: ci.status,
        due_at: ci.due_at,
        drive_folder_url: ci.drive_folder_url,
        brief_doc_url: ci.brief_doc_url,
        final_video_url: ci.final_video_url,
        ai_description: ci.ai_description,
        hashtags: ci.hashtags,
        caption: ci.caption,
        editor_notes_status: ci.editor_notes_status,
        product_name: (ci.product as any)?.name || null,
      });

      statusCounts[`ci_${ci.status}`] = (statusCounts[`ci_${ci.status}`] || 0) + 1;
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        start: startDate,
        end: endDate,
        calendar,
        total: (videos?.length || 0) + (contentItems?.length || 0),
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
    const { video_id, scheduled_date, scheduled_time } = body;

    if (!video_id) {
      return createApiErrorResponse('BAD_REQUEST', 'video_id is required', 400, correlationId);
    }

    // Validate date format if provided
    if (scheduled_date && !/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date)) {
      return createApiErrorResponse('BAD_REQUEST', 'scheduled_date must be YYYY-MM-DD format', 400, correlationId);
    }

    // Validate time format if provided (HH:MM)
    if (scheduled_time !== undefined && scheduled_time !== null && !/^\d{2}:\d{2}$/.test(scheduled_time)) {
      return createApiErrorResponse('BAD_REQUEST', 'scheduled_time must be HH:MM format', 400, correlationId);
    }

    const updatePayload: Record<string, any> = {};
    if (scheduled_date !== undefined) updatePayload.scheduled_date = scheduled_date || null;
    if (scheduled_time !== undefined) updatePayload.scheduled_time = scheduled_time || null;

    const { data, error } = await supabaseAdmin
      .from('videos')
      .update(updatePayload)
      .eq('id', video_id)
      .select('id, scheduled_date, scheduled_time')
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
