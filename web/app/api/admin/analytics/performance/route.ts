/**
 * GET /api/admin/analytics/performance
 * Aggregated performance analytics for the dashboard.
 * Query params: days=7|30|90|0 (0 = all time)
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30');
  const startDate = days > 0
    ? new Date(Date.now() - days * 86400000).toISOString()
    : null;

  try {
    // Run all queries in parallel
    const [
      allVideosResult,
      scriptsResult,
      skitsResult,
      personasResult,
      creditsResult,
    ] = await Promise.all([
      // 1. All videos with status info
      supabaseAdmin
        .from('videos')
        .select('id, recording_status, created_at, account_id')
        .then(r => r.data || []),

      // 2. Scripts in period
      startDate
        ? supabaseAdmin.from('scripts').select('created_at').gte('created_at', startDate).then(r => r.data || [])
        : supabaseAdmin.from('scripts').select('created_at').then(r => r.data || []),

      // 3. Saved skits with ai_score
      startDate
        ? supabaseAdmin.from('saved_skits').select('id, ai_score, created_at, generation_config').gte('created_at', startDate).then(r => r.data || [])
        : supabaseAdmin.from('saved_skits').select('id, ai_score, created_at, generation_config').then(r => r.data || []),

      // 4. Audience personas usage
      supabaseAdmin
        .from('audience_personas')
        .select('id, name, times_used')
        .order('times_used', { ascending: false })
        .limit(10)
        .then(r => r.data || []),

      // 5. Credit transactions in period
      startDate
        ? supabaseAdmin.from('credit_transactions').select('created_at, amount, type').gte('created_at', startDate).then(r => r.data || [])
        : supabaseAdmin.from('credit_transactions').select('created_at, amount, type').then(r => r.data || []),
    ]);

    // --- TOP METRICS ---
    const totalVideos = allVideosResult.length;

    // Videos posted this week (always last 7 days regardless of filter)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const postedThisWeek = allVideosResult.filter(
      v => v.recording_status === 'POSTED' && v.created_at >= weekAgo
    ).length;

    // Average script score from ai_score.overall
    const scores = skitsResult
      .map(s => {
        const ai = s.ai_score as { overall?: number } | null;
        return ai?.overall ?? null;
      })
      .filter((s): s is number => s !== null);
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0;

    // Pipeline throughput: scripts generated vs videos posted in period
    const periodVideos = startDate
      ? allVideosResult.filter(v => v.created_at >= startDate)
      : allVideosResult;
    const scriptsGenerated = scriptsResult.length;
    const videosPosted = periodVideos.filter(v => v.recording_status === 'POSTED').length;
    const throughputPct = scriptsGenerated > 0
      ? Math.round((videosPosted / scriptsGenerated) * 100)
      : 0;

    // --- SCRIPTS PER DAY (bar chart) ---
    const chartDays = days > 0 ? days : 30;
    const scriptsByDay = groupByDay(scriptsResult, 'created_at', chartDays);

    // --- VIDEO STATUS BREAKDOWN (pie chart) ---
    const statusCounts: Record<string, number> = {};
    const statusVideos = startDate
      ? allVideosResult.filter(v => v.created_at >= startDate)
      : allVideosResult;
    for (const v of statusVideos) {
      const status = v.recording_status || 'UNKNOWN';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    const statusBreakdown = Object.entries(statusCounts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    // --- SCORE DISTRIBUTION (histogram) ---
    const scoreBuckets = Array.from({ length: 10 }, (_, i) => ({
      range: `${i + 1}`,
      count: 0,
    }));
    for (const score of scores) {
      const bucket = Math.min(Math.floor(score) - 1, 9);
      if (bucket >= 0 && bucket < 10) {
        scoreBuckets[bucket].count++;
      }
    }

    // --- TOP PERSONAS (bar chart) ---
    const topPersonas = personasResult
      .filter(p => (p.times_used || 0) > 0)
      .map(p => ({ name: p.name, count: p.times_used || 0 }));

    // --- CREDIT USAGE OVER TIME ---
    const creditsByDay: { date: string; amount: number }[] = [];
    const creditMap = new Map<string, number>();
    for (const tx of creditsResult) {
      if (tx.type === 'debit' || tx.amount < 0) {
        const date = tx.created_at.split('T')[0];
        creditMap.set(date, (creditMap.get(date) || 0) + Math.abs(tx.amount));
      }
    }
    for (let i = 0; i < chartDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (chartDays - 1 - i));
      const dateStr = d.toISOString().split('T')[0];
      creditsByDay.push({ date: dateStr, amount: creditMap.get(dateStr) || 0 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        metrics: {
          total_videos: totalVideos,
          posted_this_week: postedThisWeek,
          avg_script_score: avgScore,
          scripts_generated: scriptsGenerated,
          videos_posted: videosPosted,
          throughput_pct: throughputPct,
        },
        scripts_by_day: scriptsByDay,
        status_breakdown: statusBreakdown,
        score_distribution: scoreBuckets,
        top_personas: topPersonas,
        credits_by_day: creditsByDay,
      },
    });
  } catch (error) {
    console.error('Performance analytics error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to fetch analytics' }, { status: 500 });
  }
}

function groupByDay(
  data: { created_at: string }[],
  _field: string,
  days: number,
): { date: string; count: number }[] {
  const countMap = new Map<string, number>();
  for (const item of data) {
    if (!item.created_at) continue;
    const date = item.created_at.split('T')[0];
    countMap.set(date, (countMap.get(date) || 0) + 1);
  }
  const result: { date: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().split('T')[0];
    result.push({ date: dateStr, count: countMap.get(dateStr) || 0 });
  }
  return result;
}
