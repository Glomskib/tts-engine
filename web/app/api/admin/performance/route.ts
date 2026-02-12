// Performance metrics API for admin dashboard
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    // Authenticate
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Get video stats - total videos
    const { count: totalVideos } = await supabaseAdmin
      .from('videos')
      .select('*', { count: 'exact', head: true });

    // Completed this month
    const { count: completedThisMonth } = await supabaseAdmin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth)
      .in('status', ['completed', 'posted', 'POSTED']);

    // Completed today
    const { count: completedToday } = await supabaseAdmin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfToday)
      .in('status', ['completed', 'posted', 'POSTED']);

    // SLA breaches this month
    const { count: slaBreaches } = await supabaseAdmin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('sla_breached', true)
      .gte('created_at', startOfMonth);

    // Currently overdue (deadline passed, not completed)
    const { count: overdueCount } = await supabaseAdmin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .lt('sla_deadline', now.toISOString())
      .not('status', 'in', '(completed,posted,POSTED,cancelled)');

    // Pending requests (from client_requests table)
    let pendingRequests = 0;
    try {
      const { count } = await supabaseAdmin
        .from('client_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      pendingRequests = count || 0;
    } catch {
      // Table may not exist yet, fallback to events_log
      const { count } = await supabaseAdmin
        .from('events_log')
        .select('*', { count: 'exact', head: true })
        .eq('entity_type', 'client_request')
        .eq('event_type', 'client_request_submitted');
      pendingRequests = count || 0;
    }

    // In progress videos
    const { count: inProgress } = await supabaseAdmin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .in('status', ['claimed', 'in_progress', 'review', 'IN_PROGRESS', 'CLAIMED']);

    // Active clients (from client_orgs or clients table)
    let activeClients = 0;
    try {
      const { count } = await supabaseAdmin
        .from('client_orgs')
        .select('*', { count: 'exact', head: true })
        .eq('billing_status', 'active');
      activeClients = count || 0;
    } catch {
      // Fallback to clients table
      try {
        const { count } = await supabaseAdmin
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');
        activeClients = count || 0;
      } catch {
        activeClients = 0;
      }
    }

    // Calculate average turnaround time (from completed videos with timestamps)
    let avgTurnaroundHours = 36; // Default
    try {
      const { data: completedVideos } = await supabaseAdmin
        .from('videos')
        .select('created_at, completed_at')
        .in('status', ['completed', 'posted', 'POSTED'])
        .not('completed_at', 'is', null)
        .gte('created_at', startOfMonth)
        .limit(100);

      if (completedVideos && completedVideos.length > 0) {
        const turnaroundTimes = completedVideos
          .filter(v => v.completed_at && v.created_at)
          .map(v => {
            const created = new Date(v.created_at).getTime();
            const completed = new Date(v.completed_at).getTime();
            return (completed - created) / (1000 * 60 * 60); // hours
          })
          .filter(h => h > 0 && h < 500); // Filter outliers

        if (turnaroundTimes.length > 0) {
          avgTurnaroundHours = Math.round(
            turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length
          );
        }
      }
    } catch (e) {
      console.error('Error calculating turnaround:', e);
    }

    // Calculate SLA compliance
    const completedCount = completedThisMonth || 0;
    const breachCount = slaBreaches || 0;
    const slaCompliance = completedCount > 0
      ? Math.round(((completedCount - breachCount) / completedCount) * 100)
      : 100;

    return NextResponse.json({
      stats: {
        totalVideos: totalVideos || 0,
        completedThisMonth: completedCount,
        completedToday: completedToday || 0,
        avgTurnaroundHours,
        slaBreaches: breachCount,
        slaCompliance,
        overdueCount: overdueCount || 0,
        activeClients,
        pendingRequests,
        inProgress: inProgress || 0,
      },
      recentActivity: [], // Can be populated from events_log if needed
    });
  } catch (error) {
    console.error('Performance API error:', error);
    return createApiErrorResponse('INTERNAL', 'Failed to fetch performance metrics', 500, correlationId);
  }
}
