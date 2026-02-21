/**
 * Cron: FinOps Daily — Every day at 6 AM UTC
 *
 * 1. Rolls up yesterday's ff_usage_events into ff_usage_rollups_daily
 * 2. Generates a daily report with spike detection + budget checks
 * 3. Posts the report to Mission Control
 *
 * Schedule: 0 6 * * * (vercel.json)
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { postMCDoc } from '@/lib/flashflow/mission-control';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface RollupRow {
  day: string;
  lane: string;
  provider: string;
  model: string;
  agent_id: string;
  template_key: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

interface BudgetRow {
  scope: string;
  scope_key: string | null;
  period: string;
  limit_usd: number;
  soft_alert_usd: number | null;
}

function fmt(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    // Report for yesterday (cron runs at 6 AM, so yesterday is complete)
    const yesterday = new Date(now.getTime() - 86400000);
    const targetDay = yesterday.toISOString().slice(0, 10);

    // ── Step 1: Rollup ──
    const { error: rollupErr } = await supabaseAdmin.rpc('refresh_ff_usage_daily_rollups', {
      target_day: targetDay,
    });
    if (rollupErr) {
      console.error('[cron/finops-daily] Rollup RPC failed:', rollupErr.message);
    }

    // ── Step 2: Fetch data ──
    const { data: todayRows } = await supabaseAdmin
      .from('ff_usage_rollups_daily')
      .select('*')
      .eq('day', targetDay) as { data: RollupRow[] | null };

    const today = todayRows ?? [];
    const todayTotal = today.reduce((s, r) => s + Number(r.cost_usd), 0);
    const todayCalls = today.reduce((s, r) => s + r.calls, 0);
    const todayInputTokens = today.reduce((s, r) => s + r.input_tokens, 0);
    const todayOutputTokens = today.reduce((s, r) => s + r.output_tokens, 0);

    // MTD
    const monthStart = targetDay.slice(0, 8) + '01';
    const { data: mtdRows } = await supabaseAdmin
      .from('ff_usage_rollups_daily')
      .select('*')
      .gte('day', monthStart)
      .lte('day', targetDay) as { data: RollupRow[] | null };

    const mtdTotal = (mtdRows ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);

    // Lane breakdown
    const laneMap = new Map<string, { cost: number; calls: number }>();
    for (const r of today) {
      const entry = laneMap.get(r.lane) ?? { cost: 0, calls: 0 };
      entry.cost += Number(r.cost_usd);
      entry.calls += r.calls;
      laneMap.set(r.lane, entry);
    }

    // Top combos
    const comboMap = new Map<string, { cost: number; calls: number }>();
    for (const r of today) {
      const key = `${r.provider}/${r.model} (${r.template_key || 'general'})`;
      const entry = comboMap.get(key) ?? { cost: 0, calls: 0 };
      entry.cost += Number(r.cost_usd);
      entry.calls += r.calls;
      comboMap.set(key, entry);
    }
    const topCombos = [...comboMap.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 10);

    // ── Step 3: Spike detection ──
    const sevenDaysAgo = new Date(yesterday.getTime() - 7 * 86400000)
      .toISOString().slice(0, 10);
    const { data: weekRows } = await supabaseAdmin
      .from('ff_usage_rollups_daily')
      .select('*')
      .gte('day', sevenDaysAgo)
      .lt('day', targetDay) as { data: RollupRow[] | null };

    const alerts: string[] = [];
    const laneDailyTotals = new Map<string, Map<string, number>>();
    for (const r of weekRows ?? []) {
      if (!laneDailyTotals.has(r.lane)) laneDailyTotals.set(r.lane, new Map());
      const dayMap = laneDailyTotals.get(r.lane)!;
      dayMap.set(r.day, (dayMap.get(r.day) ?? 0) + Number(r.cost_usd));
    }

    for (const [lane, laneData] of laneMap) {
      const dayTotals = laneDailyTotals.get(lane);
      if (!dayTotals || dayTotals.size === 0) continue;
      const avg = [...dayTotals.values()].reduce((s, v) => s + v, 0) / dayTotals.size;
      if (laneData.cost > 1.5 * avg && laneData.cost > 0.50) {
        alerts.push(
          `**SPIKE** in ${lane}: ${fmt(laneData.cost)} vs 7-day avg ${fmt(avg)} (${((laneData.cost / avg - 1) * 100).toFixed(0)}% over)`
        );
      }
    }

    // ── Step 4: Budget checks ──
    const { data: budgets } = await supabaseAdmin
      .from('ff_budgets')
      .select('scope, scope_key, period, limit_usd, soft_alert_usd')
      .eq('enabled', true) as { data: BudgetRow[] | null };

    for (const budget of budgets ?? []) {
      let spend = 0;
      if (budget.period === 'daily') {
        if (budget.scope === 'global') spend = todayTotal;
        else if (budget.scope === 'lane' && budget.scope_key) spend = laneMap.get(budget.scope_key)?.cost ?? 0;
      } else if (budget.period === 'monthly') {
        if (budget.scope === 'global') spend = mtdTotal;
        else if (budget.scope === 'lane' && budget.scope_key) {
          spend = (mtdRows ?? []).filter(r => r.lane === budget.scope_key).reduce((s, r) => s + Number(r.cost_usd), 0);
        }
      }

      if (spend >= budget.limit_usd) {
        alerts.push(`**BUDGET EXCEEDED** ${budget.scope}${budget.scope_key ? `:${budget.scope_key}` : ''} (${budget.period}): ${fmt(spend)} / ${fmt(budget.limit_usd)}`);
      } else if (budget.soft_alert_usd && spend >= budget.soft_alert_usd) {
        alerts.push(`**BUDGET WARNING** ${budget.scope}${budget.scope_key ? `:${budget.scope_key}` : ''} (${budget.period}): ${fmt(spend)} / soft ${fmt(budget.soft_alert_usd)}`);
      }
    }

    // ── Step 5: Build + post report ──
    const laneBreakdown = [...laneMap.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([lane, d]) => `| ${lane} | ${d.calls} | ${fmt(d.cost)} |`)
      .join('\n');

    const topSection = topCombos.length > 0
      ? topCombos.map(([key, d], i) => `${i + 1}. ${key} — ${d.calls} calls, ${fmt(d.cost)}`).join('\n')
      : '_No usage recorded._';

    const alertsSection = alerts.length > 0
      ? alerts.map(a => `- ${a}`).join('\n')
      : '_No alerts._';

    const content = `# FinOps Daily — ${targetDay}

## Summary
| Metric | Value |
|--------|-------|
| Total cost | ${fmt(todayTotal)} |
| Total calls | ${fmtInt(todayCalls)} |
| Input tokens | ${fmtInt(todayInputTokens)} |
| Output tokens | ${fmtInt(todayOutputTokens)} |
| MTD cost | ${fmt(mtdTotal)} |

## Lane Breakdown
| Lane | Calls | Cost |
|------|-------|------|
${laneBreakdown || '| _No data_ | — | — |'}

## Top 10 Most Expensive
${topSection}

## Alerts
${alertsSection}

---
_Auto-generated by FinOps Daily cron on ${now.toISOString()}_
`;

    const mcResult = await postMCDoc({
      title: `FinOps Daily — ${targetDay}`,
      content,
      category: 'plans',
      lane: 'FlashFlow',
      tags: ['finops', 'cost', 'usage', 'daily'],
    });

    console.log(`[cron/finops-daily] Done. Cost: ${fmt(todayTotal)}, MC: ${mcResult.ok}`);

    return NextResponse.json({
      ok: true,
      day: targetDay,
      total_cost: todayTotal,
      total_calls: todayCalls,
      mtd_cost: mtdTotal,
      alerts_count: alerts.length,
      mc_posted: mcResult.ok,
      mc_doc_id: mcResult.id ?? null,
    });
  } catch (err) {
    console.error('[cron/finops-daily] Fatal:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
