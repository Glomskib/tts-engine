/**
 * GET /api/finops/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Admin-only endpoint returning usage totals by lane, provider, and model
 * plus a daily cost series for the given date range.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

interface RollupRow {
  day: string;
  lane: string;
  provider: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const { searchParams } = request.nextUrl;
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return createApiErrorResponse(
      'BAD_REQUEST',
      'start and end query params required (YYYY-MM-DD)',
      400,
      correlationId,
    );
  }

  const { data: rows } = await supabaseAdmin
    .from('ff_usage_rollups_daily')
    .select('*')
    .gte('day', start)
    .lte('day', end)
    .order('day') as { data: RollupRow[] | null };

  const allRows = rows ?? [];

  // ── Totals by lane ──
  const byLane: Record<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
  for (const r of allRows) {
    const e = byLane[r.lane] ??= { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    e.calls += r.calls;
    e.input_tokens += r.input_tokens;
    e.output_tokens += r.output_tokens;
    e.cost_usd += Number(r.cost_usd);
  }

  // ── Totals by provider ──
  const byProvider: Record<string, { calls: number; cost_usd: number }> = {};
  for (const r of allRows) {
    const e = byProvider[r.provider] ??= { calls: 0, cost_usd: 0 };
    e.calls += r.calls;
    e.cost_usd += Number(r.cost_usd);
  }

  // ── Totals by model ──
  const byModel: Record<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
  for (const r of allRows) {
    const key = `${r.provider}/${r.model}`;
    const e = byModel[key] ??= { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    e.calls += r.calls;
    e.input_tokens += r.input_tokens;
    e.output_tokens += r.output_tokens;
    e.cost_usd += Number(r.cost_usd);
  }

  // ── Daily series ──
  const dailySeries: Record<string, { calls: number; cost_usd: number }> = {};
  for (const r of allRows) {
    const e = dailySeries[r.day] ??= { calls: 0, cost_usd: 0 };
    e.calls += r.calls;
    e.cost_usd += Number(r.cost_usd);
  }

  // ── Grand totals ──
  const totalCost = allRows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const totalCalls = allRows.reduce((s, r) => s + r.calls, 0);
  const totalInputTokens = allRows.reduce((s, r) => s + r.input_tokens, 0);
  const totalOutputTokens = allRows.reduce((s, r) => s + r.output_tokens, 0);

  return NextResponse.json({
    ok: true,
    period: { start, end },
    totals: {
      cost_usd: totalCost,
      calls: totalCalls,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
    },
    by_lane: byLane,
    by_provider: byProvider,
    by_model: byModel,
    daily_series: dailySeries,
    correlation_id: correlationId,
  });
}
