import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    // Date helpers
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);
    const lastWeekStart = new Date(startOfWeek);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    // Pipeline status counts
    const { data: allVideos } = await supabaseAdmin
      .from('videos')
      .select('id, status, assigned_to, scheduled_date, created_at, last_status_changed_at');

    const videos = allVideos || [];
    const pipelineByStatus: Record<string, number> = {};
    let inPipeline = 0;
    let postedThisWeek = 0;
    let postedLastWeek = 0;
    let vaQueue = 0;
    let totalDaysInPipeline = 0;
    let pipelineCount = 0;

    const activeStatuses = ['SCRIPT_READY', 'RECORDING', 'EDITING', 'REVIEW', 'SCHEDULED', 'READY_TO_POST'];
    const postedStatuses = ['POSTED', 'LIVE'];

    for (const v of videos) {
      const status = v.status || 'UNKNOWN';
      pipelineByStatus[status] = (pipelineByStatus[status] || 0) + 1;

      if (activeStatuses.includes(status)) {
        inPipeline++;
        // Calculate days in pipeline
        const created = new Date(v.created_at);
        const days = Math.floor((now.getTime() - created.getTime()) / 86400000);
        totalDaysInPipeline += days;
        pipelineCount++;
      }

      if (postedStatuses.includes(status)) {
        const changed = new Date(v.last_status_changed_at || v.created_at);
        if (changed >= startOfWeek) postedThisWeek++;
        else if (changed >= lastWeekStart && changed < startOfWeek) postedLastWeek++;
      }

      if (v.assigned_to && activeStatuses.includes(status)) {
        vaQueue++;
      }
    }

    // Trend calculation
    const postedTrend = postedLastWeek > 0
      ? Math.round(((postedThisWeek - postedLastWeek) / postedLastWeek) * 100)
      : postedThisWeek > 0 ? 100 : 0;

    // Average days in pipeline
    const avgDaysInPipeline = pipelineCount > 0 ? Math.round(totalDaysInPipeline / pipelineCount) : 0;

    // Find bottleneck (status with most videos)
    let bottleneck: string | null = null;
    let maxCount = 0;
    for (const status of activeStatuses) {
      if ((pipelineByStatus[status] || 0) > maxCount) {
        maxCount = pipelineByStatus[status] || 0;
        bottleneck = status;
      }
    }
    if (maxCount < 3) bottleneck = null; // Only flag if 3+ stuck

    // Unread notifications
    const { count: unreadAlerts } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authContext.user.id)
      .or('read.eq.false,is_read.eq.false');

    // Recent notifications for activity feed
    const { data: recentNotifs } = await supabaseAdmin
      .from('notifications')
      .select('id, type, title, message, payload, created_at')
      .eq('user_id', authContext.user.id)
      .order('created_at', { ascending: false })
      .limit(8);

    const recentActivity = (recentNotifs || []).map(n => ({
      id: n.id,
      type: n.type || 'info',
      title: n.title || n.type || 'Notification',
      message: n.message || (n.payload as any)?.message || '',
      created_at: n.created_at,
    }));

    // Week calendar (7 days from Sunday)
    const weekCalendar = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      const dateStr = day.toISOString().slice(0, 10);
      const isToday = day.toDateString() === now.toDateString();

      // Count posted and scheduled for this day
      let posted = 0;
      let scheduled = 0;
      for (const v of videos) {
        const vDate = v.scheduled_date || v.created_at?.slice(0, 10);
        if (vDate === dateStr) {
          if (postedStatuses.includes(v.status)) posted++;
          else if (v.status === 'SCHEDULED' || v.status === 'READY_TO_POST') scheduled++;
        }
      }

      weekCalendar.push({
        date: dateStr,
        dayName: dayNames[i],
        dayNum: day.getDate(),
        posted,
        scheduled,
        isToday,
      });
    }

    // Winners count
    const { count: winnersCount } = await supabaseAdmin
      .from('winners_bank')
      .select('*', { count: 'exact', head: true });

    // Scripts count
    const { count: scriptsCount } = await supabaseAdmin
      .from('saved_skits')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      ok: true,
      data: {
        postedThisWeek,
        postedTrend,
        inPipeline,
        pipelineByStatus,
        vaQueue,
        unreadAlerts: unreadAlerts || 0,
        avgDaysInPipeline,
        bottleneck,
        recentActivity,
        weekCalendar,
        winnersCount: winnersCount || 0,
        scriptsCount: scriptsCount || 0,
        totalVideos: videos.length,
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Dashboard stats error:`, error);
    return createApiErrorResponse('INTERNAL', 'Failed to fetch stats', 500, correlationId);
  }
}
