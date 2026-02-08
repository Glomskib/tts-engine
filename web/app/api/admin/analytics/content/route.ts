/**
 * Content Analytics API
 * Returns analytics for scripts, credits, and content performance.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface DailyCount {
  date: string;
  count: number;
}

interface ContentTypeBreakdown {
  type: string;
  count: number;
  percentage: number;
}

interface ConversionFunnel {
  scripts_created: number;
  scripts_with_video: number;
  videos_completed: number;
  conversion_rate_to_video: number;
  completion_rate: number;
}

interface CreditUsage {
  date: string;
  credits_used: number;
  ai_calls: number;
}

export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString();

  try {
    // 1. Scripts generated over time
    const { data: scriptsData } = await supabaseAdmin
      .from('scripts')
      .select('created_at')
      .gte('created_at', startDateStr)
      .order('created_at', { ascending: true });

    const scriptsByDay = groupByDay(scriptsData || [], 'created_at', days);

    // 2. Video requests completed over time
    const { data: videoRequestsData } = await supabaseAdmin
      .from('video_requests')
      .select('created_at, status, completed_at')
      .gte('created_at', startDateStr);

    const videoRequestsByDay = groupByDay(
      (videoRequestsData || []).filter(v => v.status === 'completed'),
      'completed_at',
      days
    );

    // 3. Credit transactions
    const { data: creditData } = await supabaseAdmin
      .from('credit_transactions')
      .select('created_at, amount, type')
      .eq('type', 'debit')
      .gte('created_at', startDateStr);

    const creditsByDay: CreditUsage[] = [];
    const creditMap = new Map<string, { credits: number; calls: number }>();

    (creditData || []).forEach(tx => {
      const date = tx.created_at.split('T')[0];
      const existing = creditMap.get(date) || { credits: 0, calls: 0 };
      existing.credits += Math.abs(tx.amount);
      existing.calls += 1;
      creditMap.set(date, existing);
    });

    // Fill in all days
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const dateStr = d.toISOString().split('T')[0];
      const data = creditMap.get(dateStr) || { credits: 0, calls: 0 };
      creditsByDay.push({
        date: dateStr,
        credits_used: data.credits,
        ai_calls: data.calls,
      });
    }

    // 4. Content type breakdown (from scripts)
    const { data: contentTypeData } = await supabaseAdmin
      .from('scripts')
      .select('hook_style')
      .gte('created_at', startDateStr);

    const typeCount = new Map<string, number>();
    (contentTypeData || []).forEach(s => {
      const type = s.hook_style || 'unknown';
      typeCount.set(type, (typeCount.get(type) || 0) + 1);
    });

    const totalScripts = contentTypeData?.length || 0;
    const contentTypes: ContentTypeBreakdown[] = Array.from(typeCount.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: totalScripts > 0 ? Math.round((count / totalScripts) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 5. Conversion funnel
    const { count: totalScriptsCount } = await supabaseAdmin
      .from('scripts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDateStr);

    // Scripts that have been attached to videos
    const { data: scriptsWithVideos } = await supabaseAdmin
      .from('videos')
      .select('script_locked_text')
      .not('script_locked_text', 'is', null)
      .gte('created_at', startDateStr);

    const scriptsWithVideoCount = scriptsWithVideos?.length || 0;

    // Videos that are completed (POSTED status)
    const { count: videosCompletedCount } = await supabaseAdmin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('recording_status', 'POSTED')
      .gte('created_at', startDateStr);

    const funnel: ConversionFunnel = {
      scripts_created: totalScriptsCount || 0,
      scripts_with_video: scriptsWithVideoCount,
      videos_completed: videosCompletedCount || 0,
      conversion_rate_to_video: totalScriptsCount
        ? Math.round((scriptsWithVideoCount / totalScriptsCount) * 100)
        : 0,
      completion_rate: scriptsWithVideoCount
        ? Math.round(((videosCompletedCount || 0) / scriptsWithVideoCount) * 100)
        : 0,
    };

    // 6. Summary stats
    const totalCreditsUsed = creditsByDay.reduce((sum, d) => sum + d.credits_used, 0);
    const totalAiCalls = creditsByDay.reduce((sum, d) => sum + d.ai_calls, 0);

    return NextResponse.json({
      ok: true,
      data: {
        period_days: days,
        scripts_by_day: scriptsByDay,
        videos_completed_by_day: videoRequestsByDay,
        credits_by_day: creditsByDay,
        content_types: contentTypes,
        funnel,
        summary: {
          total_scripts: totalScriptsCount || 0,
          total_credits_used: totalCreditsUsed,
          total_ai_calls: totalAiCalls,
          avg_credits_per_day: Math.round(totalCreditsUsed / days),
        },
      },
    });
  } catch (error) {
    console.error('Content analytics error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to fetch analytics' }, { status: 500 });
  }
}

function groupByDay(data: { [key: string]: unknown }[], dateField: string, days: number): DailyCount[] {
  const countMap = new Map<string, number>();

  data.forEach(item => {
    const dateValue = item[dateField] as string | null;
    if (!dateValue) return;
    const date = dateValue.split('T')[0];
    countMap.set(date, (countMap.get(date) || 0) + 1);
  });

  const result: DailyCount[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().split('T')[0];
    result.push({
      date: dateStr,
      count: countMap.get(dateStr) || 0,
    });
  }

  return result;
}
