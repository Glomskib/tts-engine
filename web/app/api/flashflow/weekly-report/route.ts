/**
 * GET /api/flashflow/weekly-report?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns aggregated generation/outcome stats for the given date range.
 * Admin-only.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId =
    request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  if (!start || !end) {
    return createApiErrorResponse('VALIDATION_ERROR', 'start and end query params required (YYYY-MM-DD)', 400, correlationId);
  }

  const startDate = `${start}T00:00:00Z`;
  const endDate = `${end}T23:59:59Z`;

  // Fetch generations in range
  const { data: generations, error: genErr } = await supabaseAdmin
    .from('ff_generations')
    .select('id, template_id, prompt_version, status, created_at')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  if (genErr) {
    return createApiErrorResponse('DB_ERROR', genErr.message, 500, correlationId);
  }

  const genIds = (generations ?? []).map(g => g.id);

  // Fetch outcomes for those generations
  let outcomes: Record<string, unknown>[] = [];
  if (genIds.length > 0) {
    const { data: oc, error: ocErr } = await supabaseAdmin
      .from('ff_outcomes')
      .select('*')
      .in('generation_id', genIds);

    if (ocErr) {
      return createApiErrorResponse('DB_ERROR', ocErr.message, 500, correlationId);
    }
    outcomes = (oc ?? []) as Record<string, unknown>[];
  }

  // Compute aggregates
  const totalGenerations = generations?.length ?? 0;
  const rejectedCount = outcomes.filter(o => o.is_rejected === true).length;
  const regeneratedCount = outcomes.filter(o => o.is_regenerated === true).length;
  const winnersCount = outcomes.filter(o => o.is_winner === true).length;

  const ratings = outcomes
    .map(o => o.rating as number | null)
    .filter((r): r is number => r !== null && r !== undefined);
  const avgRating = ratings.length > 0
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : null;

  const regenRate = totalGenerations > 0 ? regeneratedCount / totalGenerations : 0;
  const rejectRate = totalGenerations > 0 ? rejectedCount / totalGenerations : 0;

  // Top 10 winners by winner_score (fallback: rating + views)
  const sortedWinners = outcomes
    .filter(o => o.is_winner === true || (o.rating as number) >= 4)
    .sort((a, b) => {
      const scoreA = (a.winner_score as number) ?? ((a.rating as number ?? 0) + (a.views as number ?? 0) / 1000);
      const scoreB = (b.winner_score as number) ?? ((b.rating as number ?? 0) + (b.views as number ?? 0) / 1000);
      return scoreB - scoreA;
    })
    .slice(0, 10);

  // Bottom 10 losers
  const sortedLosers = outcomes
    .filter(o => o.is_rejected === true || (o.rating as number) <= 2)
    .sort((a, b) => {
      const scoreA = (a.winner_score as number) ?? ((a.rating as number ?? 5) + (a.views as number ?? 0) / 1000);
      const scoreB = (b.winner_score as number) ?? ((b.rating as number ?? 5) + (b.views as number ?? 0) / 1000);
      return scoreA - scoreB;
    })
    .slice(0, 10);

  // Template breakdown
  const templateStats: Record<string, { total: number; winners: number; rejected: number }> = {};
  for (const gen of generations ?? []) {
    const tid = gen.template_id ?? 'unknown';
    if (!templateStats[tid]) {
      templateStats[tid] = { total: 0, winners: 0, rejected: 0 };
    }
    templateStats[tid].total++;
    const outcome = outcomes.find(o => o.generation_id === gen.id);
    if (outcome?.is_winner) templateStats[tid].winners++;
    if (outcome?.is_rejected) templateStats[tid].rejected++;
  }

  const data = {
    period: { start, end },
    total_generations: totalGenerations,
    winners_count: winnersCount,
    rejected_count: rejectedCount,
    regenerated_count: regeneratedCount,
    regen_rate: Math.round(regenRate * 10000) / 100,
    reject_rate: Math.round(rejectRate * 10000) / 100,
    avg_rating: avgRating !== null ? Math.round(avgRating * 100) / 100 : null,
    top_10_winners: sortedWinners.map(o => ({
      generation_id: o.generation_id,
      winner_score: o.winner_score,
      rating: o.rating,
      views: o.views,
      orders: o.orders,
    })),
    bottom_10_losers: sortedLosers.map(o => ({
      generation_id: o.generation_id,
      winner_score: o.winner_score,
      rating: o.rating,
      views: o.views,
      feedback_text: o.feedback_text,
    })),
    template_breakdown: templateStats,
  };

  const res = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  res.headers.set('x-correlation-id', correlationId);
  return res;
}
