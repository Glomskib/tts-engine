import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId } from '@/lib/api-errors';

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return NextResponse.json({ error: 'Unauthorized', correlation_id: correlationId }, { status: 401 });
    }

    const userId = authContext.user.id;
    const range = request.nextUrl.searchParams.get('range') || '7d';
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateISO = startDate.toISOString();

    // Previous period for trend calculation
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);
    const prevStartDateISO = prevStartDate.toISOString();

    // Fetch total scripts count
    const { count: scriptsTotal } = await supabaseAdmin
      .from('saved_skits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Fetch scripts this period
    const { count: scriptsThisPeriod } = await supabaseAdmin
      .from('saved_skits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startDateISO);

    // Fetch scripts previous period (for trend)
    const { count: scriptsPrevPeriod } = await supabaseAdmin
      .from('saved_skits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', prevStartDateISO)
      .lt('created_at', startDateISO);

    // Calculate trend percentage
    const currentCount = scriptsThisPeriod || 0;
    const prevCount = scriptsPrevPeriod || 0;
    let scriptsTrend = 0;
    if (prevCount > 0) {
      scriptsTrend = Math.round(((currentCount - prevCount) / prevCount) * 100);
    } else if (currentCount > 0) {
      scriptsTrend = 100;
    }

    // Fetch video requests
    const { data: videoRequests } = await supabaseAdmin
      .from('video_requests')
      .select('status')
      .eq('user_id', userId);

    const videosInQueue = videoRequests?.filter(
      v => v.status === 'pending' || v.status === 'in_progress' || v.status === 'queued'
    ).length || 0;
    const videosCompleted = videoRequests?.filter(v => v.status === 'completed').length || 0;
    const videosPending = videoRequests?.filter(v => v.status === 'pending').length || 0;

    // Fetch credits
    const { data: credits } = await supabaseAdmin
      .from('credit_balances')
      .select('credits_remaining, credits_used_this_month')
      .eq('user_id', userId)
      .single();

    // Fetch recent activity (recent scripts)
    const { data: recentScripts } = await supabaseAdmin
      .from('saved_skits')
      .select('id, title, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Build activity feed
    const recentActivity = (recentScripts || []).map(s => ({
      id: s.id,
      type: 'script' as const,
      action: `Created script: ${s.title || 'Untitled'}`,
      timestamp: s.created_at,
    }));

    return NextResponse.json({
      scriptsGenerated: scriptsTotal || 0,
      scriptsThisWeek: currentCount,
      scriptsTrend,
      videosInQueue,
      videosCompleted,
      videosPending,
      creditsUsed: credits?.credits_used_this_month || 0,
      creditsRemaining: credits?.credits_remaining || 0,
      recentActivity,
    });
  } catch (error) {
    console.error(`[${correlationId}] Dashboard stats error:`, error);
    return NextResponse.json({ error: 'Failed to fetch stats', correlation_id: correlationId }, { status: 500 });
  }
}
