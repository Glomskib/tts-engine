/**
 * GET /api/finops/dashboard
 *
 * Owner-only FinOps dashboard endpoint.
 * Returns summary cards, burn-rate projection, daily series,
 * top models, top endpoints, and cost by lane.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const ownerCheck = await requireOwner(request);
  if (ownerCheck) return ownerCheck;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // 30 days ago
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  // 7 days ago
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  // First of the month
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  // ── Query 1: Rollups for 30-day range ──
  const { data: rollups } = await supabaseAdmin
    .from('ff_usage_rollups_daily')
    .select('*')
    .gte('day', thirtyDaysAgoStr)
    .lte('day', todayStr)
    .order('day');

  const allRollups = rollups ?? [];

  // Daily series (last 30 days)
  const dailyMap: Record<string, { cost: number; calls: number }> = {};
  for (const r of allRollups) {
    const e = dailyMap[r.day] ??= { cost: 0, calls: 0 };
    e.cost += Number(r.cost_usd);
    e.calls += r.calls;
  }
  const daily_series = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, cost: v.cost, calls: v.calls }));

  // Top models (last 30d, from rollups)
  const modelMap: Record<string, { calls: number; cost: number }> = {};
  for (const r of allRollups) {
    const key = `${r.provider}/${r.model}`;
    const e = modelMap[key] ??= { calls: 0, cost: 0 };
    e.calls += r.calls;
    e.cost += Number(r.cost_usd);
  }
  const top_models = Object.entries(modelMap)
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 20);

  // Cost by lane (last 30d)
  const laneMap: Record<string, { calls: number; cost: number }> = {};
  for (const r of allRollups) {
    const e = laneMap[r.lane] ??= { calls: 0, cost: 0 };
    e.calls += r.calls;
    e.cost += Number(r.cost_usd);
  }
  const by_lane = Object.entries(laneMap)
    .map(([lane, v]) => ({ lane, ...v }))
    .sort((a, b) => b.cost - a.cost);

  // MTD cost (from rollups, month start to today)
  const mtdRollups = allRollups.filter(r => r.day >= monthStart);
  const mtdCostRollup = mtdRollups.reduce((s, r) => s + Number(r.cost_usd), 0);
  const mtdCalls = mtdRollups.reduce((s, r) => s + r.calls, 0);

  // 7-day cost (from rollups)
  const weekRollups = allRollups.filter(r => r.day >= sevenDaysAgoStr);
  const weekCost = weekRollups.reduce((s, r) => s + Number(r.cost_usd), 0);

  // ── Query 2: Today's spend from raw events (real-time) ──
  const todayStart = new Date(todayStr + 'T00:00:00Z').toISOString();
  const { data: todayRows } = await supabaseAdmin
    .from('ff_usage_events')
    .select('cost_usd')
    .gte('created_at', todayStart);

  const todayCost = (todayRows ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);

  // ── Query 3: Top endpoints from raw events (last 7d) ──
  const { data: endpointRows } = await supabaseAdmin
    .from('ff_usage_events')
    .select('endpoint, cost_usd')
    .gte('created_at', new Date(sevenDaysAgoStr + 'T00:00:00Z').toISOString())
    .not('endpoint', 'is', null)
    .limit(10000);

  const epMap: Record<string, { calls: number; cost: number }> = {};
  for (const r of (endpointRows ?? [])) {
    if (!r.endpoint) continue;
    const e = epMap[r.endpoint] ??= { calls: 0, cost: 0 };
    e.calls += 1;
    e.cost += Number(r.cost_usd);
  }
  const top_endpoints = Object.entries(epMap)
    .map(([endpoint, v]) => ({ endpoint, ...v }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 20);

  // ── Burn rate projection ──
  const projected_monthly = daysElapsed > 0
    ? mtdCostRollup * (daysInMonth / daysElapsed)
    : 0;

  return NextResponse.json({
    ok: true,
    summary: {
      today: todayCost,
      week: weekCost,
      month: mtdCostRollup,
      mtd_calls: mtdCalls,
    },
    burn_rate: {
      mtd_cost: mtdCostRollup,
      days_elapsed: daysElapsed,
      days_in_month: daysInMonth,
      projected_monthly,
    },
    daily_series,
    top_models,
    top_endpoints,
    by_lane,
  });
}
