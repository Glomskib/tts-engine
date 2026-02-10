import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateRecommendations } from '@/lib/analytics/recommendations';
import {
  HOOK_TYPE_LABELS,
  CONTENT_FORMAT_LABELS,
  type WinnersAnalytics,
  type AnalyticsPeriod,
  type WeeklyTrend,
  type EngagementTrend,
} from '@/lib/analytics/types';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/winners
 * Returns aggregated analytics data from Winners Bank
 *
 * Query params:
 *   period: '7d' | '30d' | '90d' | 'all' (default: '30d')
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const userId = authContext.user.id;
  const searchParams = request.nextUrl.searchParams;
  const period = (searchParams.get('period') || '30d') as AnalyticsPeriod;

  // Calculate date range
  const now = new Date();
  let startDate: Date | null = null;
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
    default:
      startDate = null;
  }

  try {
    // Fetch all data in parallel
    const [scriptsResult, winnersResult, periodWinnersResult] = await Promise.all([
      // Total scripts generated
      fetchScriptsCount(userId, startDate),
      // All winners
      fetchWinners(userId),
      // Winners in period
      fetchWinners(userId, startDate),
    ]);

    const totalScripts = scriptsResult.total;
    const scriptsThisPeriod = scriptsResult.periodCount;
    const allWinners = winnersResult;
    const periodWinners = periodWinnersResult;

    // Calculate overview metrics
    const totalWinners = allWinners.length;
    const winnersThisPeriod = periodWinners.length;
    const winRate = totalScripts > 0 ? (totalWinners / totalScripts) * 100 : 0;

    const winnersWithViews = allWinners.filter(w => w.view_count && w.view_count > 0);
    const winnersWithEngagement = allWinners.filter(w => w.engagement_rate && w.engagement_rate > 0);

    const avgWinnerViews = winnersWithViews.length > 0
      ? Math.round(winnersWithViews.reduce((sum, w) => sum + (w.view_count || 0), 0) / winnersWithViews.length)
      : 0;
    const avgWinnerEngagement = winnersWithEngagement.length > 0
      ? parseFloat((winnersWithEngagement.reduce((sum, w) => sum + (w.engagement_rate || 0), 0) / winnersWithEngagement.length).toFixed(2))
      : 0;
    const totalViews = allWinners.reduce((sum, w) => sum + (w.view_count || 0), 0);

    // Aggregate hook types
    const hookTypeCounts = new Map<string, { count: number; totalEngagement: number; totalViews: number }>();
    allWinners.forEach(w => {
      if (w.hook_type) {
        const current = hookTypeCounts.get(w.hook_type) || { count: 0, totalEngagement: 0, totalViews: 0 };
        hookTypeCounts.set(w.hook_type, {
          count: current.count + 1,
          totalEngagement: current.totalEngagement + (w.engagement_rate || 0),
          totalViews: current.totalViews + (w.view_count || 0),
        });
      }
    });
    const hookTypes = Array.from(hookTypeCounts.entries())
      .map(([type, data]) => ({
        type,
        label: HOOK_TYPE_LABELS[type] || type,
        count: data.count,
        avgEngagement: parseFloat((data.totalEngagement / data.count).toFixed(2)),
        avgViews: Math.round(data.totalViews / data.count),
      }))
      .sort((a, b) => b.count - a.count);

    // Aggregate content formats
    const formatCounts = new Map<string, { count: number; totalEngagement: number; totalViews: number }>();
    allWinners.forEach(w => {
      if (w.content_format) {
        const current = formatCounts.get(w.content_format) || { count: 0, totalEngagement: 0, totalViews: 0 };
        formatCounts.set(w.content_format, {
          count: current.count + 1,
          totalEngagement: current.totalEngagement + (w.engagement_rate || 0),
          totalViews: current.totalViews + (w.view_count || 0),
        });
      }
    });
    const contentFormats = Array.from(formatCounts.entries())
      .map(([format, data]) => ({
        format,
        label: CONTENT_FORMAT_LABELS[format] || format,
        count: data.count,
        avgEngagement: parseFloat((data.totalEngagement / data.count).toFixed(2)),
        avgViews: Math.round(data.totalViews / data.count),
      }))
      .sort((a, b) => b.count - a.count);

    // Video length stats — table doesn't have video_length_seconds,
    // so use avg_watch_time as a proxy if available
    const videoLengths = {
      shortest: 0,
      longest: 0,
      avgWinning: 0,
      sweetSpot: null as { min: number; max: number } | null,
    };

    // Trends - weekly data
    const scriptsOverTime = await fetchWeeklyScriptTrends(userId, period);
    const engagementOverTime = calculateEngagementTrends(allWinners);

    // Patterns from AI analysis
    const winningPatterns: string[] = [];
    const underperformingPatterns: string[] = [];
    allWinners.forEach(w => {
      if (w.ai_analysis?.patterns?.hook_pattern) {
        winningPatterns.push(w.ai_analysis.patterns.hook_pattern);
      }
      if (w.ai_analysis?.patterns?.content_pattern) {
        winningPatterns.push(w.ai_analysis.patterns.content_pattern);
      }
      if (w.ai_analysis?.avoid) {
        underperformingPatterns.push(...w.ai_analysis.avoid);
      }
    });

    const analytics: WinnersAnalytics = {
      overview: {
        totalScriptsGenerated: totalScripts,
        scriptsThisPeriod,
        totalWinners,
        winnersThisPeriod,
        winRate: parseFloat(winRate.toFixed(2)),
        avgWinnerViews,
        avgWinnerEngagement,
        totalViews,
      },
      topPerformers: {
        hookTypes: hookTypes.slice(0, 5),
        contentFormats: contentFormats.slice(0, 5),
        personas: [], // Not implemented yet
        videoLengths,
      },
      trends: {
        scriptsOverTime,
        engagementOverTime,
      },
      patterns: {
        winning: [...new Set(winningPatterns)].slice(0, 5),
        underperforming: [...new Set(underperformingPatterns)].slice(0, 3),
      },
      recommendations: [],
    };

    // Generate recommendations
    analytics.recommendations = generateRecommendations(analytics);

    const response = NextResponse.json({
      ok: true,
      analytics,
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;

  } catch (err) {
    console.error(`[${correlationId}] Analytics error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch analytics', 500, correlationId);
  }
}

// Helper functions

async function fetchScriptsCount(userId: string, startDate: Date | null) {
  // Total count
  const { count: total } = await supabaseAdmin
    .from('saved_skits')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Period count
  let periodCount = total || 0;
  if (startDate) {
    const { count } = await supabaseAdmin
      .from('saved_skits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString());
    periodCount = count || 0;
  }

  return { total: total || 0, periodCount };
}

interface WinnerRow {
  id: string;
  view_count: number | null;
  engagement_rate: number | null;
  hook_type: string | null;
  content_format: string | null;
  created_at: string;
  ai_analysis: {
    patterns?: {
      hook_pattern?: string;
      content_pattern?: string;
    };
    avoid?: string[];
  } | null;
}

async function fetchWinners(userId: string, startDate?: Date | null): Promise<WinnerRow[]> {
  let query = supabaseAdmin
    .from('winners_bank')
    .select('id, view_count, engagement_rate, hook_type, content_format, created_at, ai_analysis')
    .eq('user_id', userId);

  if (startDate) {
    query = query.gte('created_at', startDate.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as WinnerRow[];
}

async function fetchWeeklyScriptTrends(userId: string, period: AnalyticsPeriod): Promise<WeeklyTrend[]> {
  const weeks = period === 'all' ? 12 : period === '90d' ? 12 : period === '30d' ? 4 : 1;
  const trends: WeeklyTrend[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - (i * 7));
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);

    const weekLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Count scripts in this week
    const { count: scriptsCount } = await supabaseAdmin
      .from('saved_skits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', weekStart.toISOString())
      .lt('created_at', weekEnd.toISOString());

    // Count winners in this week
    const { count: winnersCount } = await supabaseAdmin
      .from('winners_bank')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', weekStart.toISOString())
      .lt('created_at', weekEnd.toISOString());

    trends.push({
      week: weekLabel,
      scripts: scriptsCount || 0,
      winners: winnersCount || 0,
    });
  }

  return trends;
}

function calculateEngagementTrends(winners: WinnerRow[]): EngagementTrend[] {
  // Group winners by week
  const weeklyData = new Map<string, { engagement: number[]; views: number[] }>();

  winners.forEach(w => {
    const date = new Date(w.created_at);
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const current = weeklyData.get(weekLabel) || { engagement: [], views: [] };
    if (w.engagement_rate) current.engagement.push(w.engagement_rate);
    if (w.view_count) current.views.push(w.view_count);
    weeklyData.set(weekLabel, current);
  });

  return Array.from(weeklyData.entries())
    .map(([week, data]) => ({
      week,
      avgEngagement: data.engagement.length > 0
        ? parseFloat((data.engagement.reduce((a, b) => a + b, 0) / data.engagement.length).toFixed(2))
        : 0,
      avgViews: data.views.length > 0
        ? Math.round(data.views.reduce((a, b) => a + b, 0) / data.views.length)
        : 0,
    }))
    .slice(-8); // Last 8 weeks
}
