#!/usr/bin/env tsx
/**
 * FinOps Daily Report
 *
 * Reads today + MTD rollups, detects spend spikes, checks budgets,
 * and posts a summary doc to Mission Control.
 *
 * Usage:
 *   tsx scripts/finops/daily-report.ts              # report for today
 *   tsx scripts/finops/daily-report.ts 2026-02-19   # report for specific day
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

// ── Mission Control posting ──────────────────────────────────

async function postMCDoc(input: {
  title: string;
  content: string;
  category?: string;
  lane?: string;
  tags?: string[];
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const baseUrl = process.env.MC_BASE_URL || 'http://127.0.0.1:3100';
  const token = process.env.MC_API_TOKEN;

  if (!token) {
    console.warn('[finops/daily-report] MC_API_TOKEN not set — skipping MC post');
    return { ok: false, error: 'MC_API_TOKEN not configured' };
  }

  try {
    const res = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: input.title,
        content: input.content,
        category: input.category ?? 'plans',
        lane: input.lane ?? 'FlashFlow',
        tags: Array.isArray(input.tags) ? input.tags.join(',') : '',
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }

    const json = await res.json();
    return { ok: true, id: json.id ?? json.data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Types ────────────────────────────────────────────────────

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
  id: string;
  scope: string;
  scope_key: string | null;
  period: string;
  limit_usd: number;
  soft_alert_usd: number | null;
  enabled: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

function fmt(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

// ── Main ─────────────────────────────────────────────────────

async function run(targetDay: string) {
  console.log(`[finops/daily-report] Generating report for: ${targetDay}`);

  // Ensure rollup is done for today
  const { error: rollupErr } = await supabase.rpc('refresh_ff_usage_daily_rollups', {
    target_day: targetDay,
  });
  if (rollupErr) {
    console.warn('[finops/daily-report] Rollup RPC failed:', rollupErr.message);
  }

  // ── Fetch today's rollups ──
  const { data: todayRows } = await supabase
    .from('ff_usage_rollups_daily')
    .select('*')
    .eq('day', targetDay) as { data: RollupRow[] | null };

  const today = todayRows ?? [];

  // ── Fetch MTD rollups ──
  const monthStart = targetDay.slice(0, 8) + '01';
  const { data: mtdRows } = await supabase
    .from('ff_usage_rollups_daily')
    .select('*')
    .gte('day', monthStart)
    .lte('day', targetDay) as { data: RollupRow[] | null };

  const mtd = mtdRows ?? [];

  // ── Fetch 7-day history for spike detection ──
  const sevenDaysAgo = new Date(new Date(targetDay).getTime() - 7 * 86400000)
    .toISOString().slice(0, 10);
  const { data: weekRows } = await supabase
    .from('ff_usage_rollups_daily')
    .select('*')
    .gte('day', sevenDaysAgo)
    .lt('day', targetDay) as { data: RollupRow[] | null };

  const week = weekRows ?? [];

  // ── Aggregates ──

  const todayTotal = today.reduce((s, r) => s + Number(r.cost_usd), 0);
  const todayCalls = today.reduce((s, r) => s + r.calls, 0);
  const todayInputTokens = today.reduce((s, r) => s + r.input_tokens, 0);
  const todayOutputTokens = today.reduce((s, r) => s + r.output_tokens, 0);
  const mtdTotal = mtd.reduce((s, r) => s + Number(r.cost_usd), 0);

  // Lane breakdown
  const laneMap = new Map<string, { cost: number; calls: number }>();
  for (const r of today) {
    const entry = laneMap.get(r.lane) ?? { cost: 0, calls: 0 };
    entry.cost += Number(r.cost_usd);
    entry.calls += r.calls;
    laneMap.set(r.lane, entry);
  }

  // Top 10 most expensive model/template combos
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

  // ── Spike detection ──
  // Per-lane: today_cost > 1.5 * 7-day avg and > $0.50
  const alerts: string[] = [];

  const weekLaneTotals = new Map<string, number[]>();
  for (const r of week) {
    const dayKey = r.day;
    // Group by lane+day
    const key = `${r.lane}|${dayKey}`;
    // First collect per-day totals per lane
    if (!weekLaneTotals.has(r.lane)) weekLaneTotals.set(r.lane, []);
  }

  // Build per-lane daily totals for the past 7 days
  const laneDailyTotals = new Map<string, Map<string, number>>();
  for (const r of week) {
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
        `**SPIKE** in ${lane}: today ${fmt(laneData.cost)} vs 7-day avg ${fmt(avg)} (${((laneData.cost / avg - 1) * 100).toFixed(0)}% over)`
      );
    }
  }

  // ── Budget checks ──
  const { data: budgets } = await supabase
    .from('ff_budgets')
    .select('*')
    .eq('enabled', true) as { data: BudgetRow[] | null };

  for (const budget of budgets ?? []) {
    let spend = 0;

    if (budget.period === 'daily') {
      if (budget.scope === 'global') {
        spend = todayTotal;
      } else if (budget.scope === 'lane' && budget.scope_key) {
        spend = laneMap.get(budget.scope_key)?.cost ?? 0;
      }
    } else if (budget.period === 'monthly') {
      if (budget.scope === 'global') {
        spend = mtdTotal;
      } else if (budget.scope === 'lane' && budget.scope_key) {
        spend = mtd
          .filter(r => r.lane === budget.scope_key)
          .reduce((s, r) => s + Number(r.cost_usd), 0);
      }
    }

    if (spend >= budget.limit_usd) {
      alerts.push(
        `**BUDGET EXCEEDED** ${budget.scope}${budget.scope_key ? `:${budget.scope_key}` : ''} ` +
        `(${budget.period}): spent ${fmt(spend)} / limit ${fmt(budget.limit_usd)}`
      );
    } else if (budget.soft_alert_usd && spend >= budget.soft_alert_usd) {
      alerts.push(
        `**BUDGET WARNING** ${budget.scope}${budget.scope_key ? `:${budget.scope_key}` : ''} ` +
        `(${budget.period}): spent ${fmt(spend)} / soft alert ${fmt(budget.soft_alert_usd)} / limit ${fmt(budget.limit_usd)}`
      );
    }
  }

  // ── Cost per winner (join via ff_outcomes) ──
  let costPerWinnerSection = '_No winner data available._';
  try {
    const { data: winners } = await supabase
      .from('ff_outcomes')
      .select('generation_id')
      .eq('is_winner', true)
      .gte('created_at', monthStart + 'T00:00:00Z');

    if (winners && winners.length > 0) {
      const winnerGenIds = winners.map(w => w.generation_id);
      const { data: winnerUsage } = await supabase
        .from('ff_usage_events')
        .select('cost_usd')
        .in('generation_id', winnerGenIds);

      if (winnerUsage && winnerUsage.length > 0) {
        const totalWinnerCost = winnerUsage.reduce((s, r) => s + Number(r.cost_usd), 0);
        const avgWinnerCost = totalWinnerCost / winners.length;
        costPerWinnerSection = `${winners.length} winners this month, avg cost per winner: ${fmt(avgWinnerCost)}, total winner spend: ${fmt(totalWinnerCost)}`;
      }
    }
  } catch {
    // Non-fatal
  }

  // ── Build report markdown ──

  const laneBreakdown = [...laneMap.entries()]
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([lane, d]) => `| ${lane} | ${d.calls} | ${fmt(d.cost)} |`)
    .join('\n');

  const topCombosSection = topCombos.length > 0
    ? topCombos.map(([key, d], i) =>
        `${i + 1}. ${key} — ${d.calls} calls, ${fmt(d.cost)}`
      ).join('\n')
    : '_No usage recorded._';

  const alertsSection = alerts.length > 0
    ? alerts.map(a => `- ${a}`).join('\n')
    : '_No alerts._';

  const content = `# FinOps Daily — ${targetDay}

## Today's Summary
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

## Top 10 Most Expensive (Model/Template)
${topCombosSection}

## Cost Per Winner (MTD)
${costPerWinnerSection}

## Alerts & Recommendations
${alertsSection}

---
_Auto-generated by FinOps Daily Report on ${new Date().toISOString()}_
`;

  console.log(content);

  // ── Post to Mission Control ──
  const mcResult = await postMCDoc({
    title: `FinOps Daily — ${targetDay}`,
    content,
    category: 'plans',
    lane: 'FlashFlow',
    tags: ['finops', 'cost', 'usage', 'daily'],
  });

  console.log(`[finops/daily-report] MC posted: ${mcResult.ok}${mcResult.id ? ` (id: ${mcResult.id})` : ''}`);

  return { todayTotal, mtdTotal, alerts, mc_posted: mcResult.ok };
}

const targetDay = process.argv[2] || new Date().toISOString().slice(0, 10);
run(targetDay).then(result => {
  console.log('[finops/daily-report] Result:', JSON.stringify(result, null, 2));
}).catch(err => {
  console.error('[finops/daily-report] Fatal:', err);
  process.exit(1);
});

export { run as runDailyReport };
