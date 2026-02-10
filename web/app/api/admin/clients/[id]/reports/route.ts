/**
 * Client Reports API
 * Returns reporting data for a specific client (for agencies).
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface VideoMetrics {
  total_delivered: number;
  total_in_progress: number;
  total_pending: number;
  by_status: Record<string, number>;
}

interface TurnaroundMetrics {
  average_hours: number;
  median_hours: number;
  fastest_hours: number;
  slowest_hours: number;
  by_month: { month: string; avg_hours: number; count: number }[];
}

interface ContentBreakdown {
  type: string;
  count: number;
  percentage: number;
}

export async function GET(request: Request, context: RouteContext) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  const { id: clientId } = await context.params;
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '90');

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString();

  try {
    // Get client info
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
    }

    // Get all video requests for this client
    const { data: videoRequests } = await supabaseAdmin
      .from('video_requests')
      .select('*')
      .eq('user_id', client.user_id)
      .gte('created_at', startDateStr)
      .order('created_at', { ascending: false });

    const requests = videoRequests || [];

    // 1. Video Metrics
    const videoMetrics: VideoMetrics = {
      total_delivered: requests.filter(r => r.status === 'completed').length,
      total_in_progress: requests.filter(r => ['in_progress', 'assigned', 'revision'].includes(r.status)).length,
      total_pending: requests.filter(r => r.status === 'pending').length,
      by_status: {},
    };

    requests.forEach(r => {
      videoMetrics.by_status[r.status] = (videoMetrics.by_status[r.status] || 0) + 1;
    });

    // 2. Turnaround Time Metrics (for completed videos)
    const completedRequests = requests.filter(r => r.status === 'completed' && r.completed_at);
    const turnaroundTimes: number[] = completedRequests.map(r => {
      const created = new Date(r.created_at).getTime();
      const completed = new Date(r.completed_at).getTime();
      return (completed - created) / (1000 * 60 * 60); // hours
    }).sort((a, b) => a - b);

    const turnaroundMetrics: TurnaroundMetrics = {
      average_hours: turnaroundTimes.length > 0
        ? Math.round(turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length)
        : 0,
      median_hours: turnaroundTimes.length > 0
        ? Math.round(turnaroundTimes[Math.floor(turnaroundTimes.length / 2)])
        : 0,
      fastest_hours: turnaroundTimes.length > 0 ? Math.round(turnaroundTimes[0]) : 0,
      slowest_hours: turnaroundTimes.length > 0 ? Math.round(turnaroundTimes[turnaroundTimes.length - 1]) : 0,
      by_month: [],
    };

    // Group turnaround by month
    const monthMap = new Map<string, { total: number; count: number }>();
    completedRequests.forEach(r => {
      const month = r.completed_at.slice(0, 7); // YYYY-MM
      const created = new Date(r.created_at).getTime();
      const completed = new Date(r.completed_at).getTime();
      const hours = (completed - created) / (1000 * 60 * 60);

      const existing = monthMap.get(month) || { total: 0, count: 0 };
      existing.total += hours;
      existing.count += 1;
      monthMap.set(month, existing);
    });

    turnaroundMetrics.by_month = Array.from(monthMap.entries())
      .map(([month, data]) => ({
        month,
        avg_hours: Math.round(data.total / data.count),
        count: data.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // 3. Content Type Breakdown (from scripts associated with videos)
    const scriptIds = requests
      .filter(r => r.script_id)
      .map(r => r.script_id);

    let contentBreakdown: ContentBreakdown[] = [];

    if (scriptIds.length > 0) {
      const { data: scripts } = await supabaseAdmin
        .from('scripts')
        .select('hook_style')
        .in('id', scriptIds);

      if (scripts && scripts.length > 0) {
        const typeCount = new Map<string, number>();
        scripts.forEach(s => {
          const type = s.hook_style || 'unknown';
          typeCount.set(type, (typeCount.get(type) || 0) + 1);
        });

        const total = scripts.length;
        contentBreakdown = Array.from(typeCount.entries())
          .map(([type, count]) => ({
            type,
            count,
            percentage: Math.round((count / total) * 100),
          }))
          .sort((a, b) => b.count - a.count);
      }
    }

    // 4. Videos by week for chart
    const videosByWeek: { week: string; count: number }[] = [];
    const weekMap = new Map<string, number>();

    requests.filter(r => r.status === 'completed').forEach(r => {
      const date = new Date(r.completed_at || r.created_at);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + 1);
    });

    Array.from(weekMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([week, count]) => {
        videosByWeek.push({ week, count });
      });

    // 5. Revision rate
    const totalWithRevisions = requests.filter(r => r.revision_count > 0).length;
    const revisionRate = requests.length > 0
      ? Math.round((totalWithRevisions / requests.length) * 100)
      : 0;

    return NextResponse.json({
      ok: true,
      data: {
        client: {
          id: client.id,
          company_name: client.company_name,
          contact_name: client.contact_name,
          plan_name: client.plan_name,
        },
        period_days: days,
        generated_at: new Date().toISOString(),
        video_metrics: videoMetrics,
        turnaround_metrics: turnaroundMetrics,
        content_breakdown: contentBreakdown,
        videos_by_week: videosByWeek,
        revision_rate: revisionRate,
        total_requests: requests.length,
      },
    });
  } catch (error) {
    console.error('Client reports error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to generate report' }, { status: 500 });
  }
}
