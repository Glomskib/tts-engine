#!/usr/bin/env tsx
/**
 * FinOps Weekly Report
 *
 * Aggregates the past 7 days of ff_usage_rollups_daily and posts
 * a weekly summary to Mission Control.
 *
 * Usage:
 *   tsx scripts/finops/weekly-report.ts              # week ending today
 *   tsx scripts/finops/weekly-report.ts 2026-02-19   # week ending on date
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

async function postMCDoc(input: {
  title: string;
  content: string;
  category?: string;
  lane?: string;
  tags?: string[];
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const baseUrl = process.env.MC_BASE_URL || 'https://mc.flashflowai.com';
  const token = process.env.MC_API_TOKEN;

  if (!token) {
    console.warn('[finops/weekly-report] MC_API_TOKEN not set — skipping MC post');
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

function fmt(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

async function run(endDate: string) {
  const end = new Date(endDate);
  const start = new Date(end.getTime() - 6 * 86400000);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = endDate;

  console.log(`[finops/weekly-report] Period: ${startStr} to ${endStr}`);

  // ── Fetch all rollups for the week ──
  const { data: rows } = await supabase
    .from('ff_usage_rollups_daily')
    .select('*')
    .gte('day', startStr)
    .lte('day', endStr)
    .order('day') as { data: RollupRow[] | null };

  const allRows = rows ?? [];
  const weekTotal = allRows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const weekCalls = allRows.reduce((s, r) => s + r.calls, 0);
  const weekInputTokens = allRows.reduce((s, r) => s + r.input_tokens, 0);
  const weekOutputTokens = allRows.reduce((s, r) => s + r.output_tokens, 0);

  // ── Daily spend breakdown ──
  const dailyMap = new Map<string, number>();
  for (const r of allRows) {
    dailyMap.set(r.day, (dailyMap.get(r.day) ?? 0) + Number(r.cost_usd));
  }
  const dailyBreakdown = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, cost]) => `| ${day} | ${fmt(cost)} |`)
    .join('\n');

  // ── Lane breakdown ──
  const laneMap = new Map<string, { cost: number; calls: number }>();
  for (const r of allRows) {
    const entry = laneMap.get(r.lane) ?? { cost: 0, calls: 0 };
    entry.cost += Number(r.cost_usd);
    entry.calls += r.calls;
    laneMap.set(r.lane, entry);
  }
  const laneBreakdown = [...laneMap.entries()]
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([lane, d]) => `| ${lane} | ${d.calls} | ${fmt(d.cost)} |`)
    .join('\n');

  // ── Provider/model breakdown ──
  const modelMap = new Map<string, { cost: number; calls: number }>();
  for (const r of allRows) {
    const key = `${r.provider}/${r.model}`;
    const entry = modelMap.get(key) ?? { cost: 0, calls: 0 };
    entry.cost += Number(r.cost_usd);
    entry.calls += r.calls;
    modelMap.set(key, entry);
  }
  const modelBreakdown = [...modelMap.entries()]
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 15)
    .map(([model, d], i) => `${i + 1}. **${model}** — ${fmtInt(d.calls)} calls, ${fmt(d.cost)}`)
    .join('\n');

  // ── Previous week comparison ──
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - 6 * 86400000);
  const { data: prevRows } = await supabase
    .from('ff_usage_rollups_daily')
    .select('cost_usd')
    .gte('day', prevStart.toISOString().slice(0, 10))
    .lte('day', prevEnd.toISOString().slice(0, 10));

  const prevTotal = (prevRows ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
  const wowChange = prevTotal > 0
    ? `${((weekTotal / prevTotal - 1) * 100).toFixed(1)}% ${weekTotal > prevTotal ? 'increase' : 'decrease'}`
    : 'N/A (no previous week data)';

  // ── Build report ──
  const content = `# FinOps Weekly — ${startStr} to ${endStr}

## Weekly Summary
| Metric | Value |
|--------|-------|
| Total cost | ${fmt(weekTotal)} |
| Total calls | ${fmtInt(weekCalls)} |
| Input tokens | ${fmtInt(weekInputTokens)} |
| Output tokens | ${fmtInt(weekOutputTokens)} |
| Week-over-week | ${wowChange} |
| Previous week | ${fmt(prevTotal)} |

## Daily Spend
| Day | Cost |
|-----|------|
${dailyBreakdown || '| _No data_ | — |'}

## Lane Breakdown
| Lane | Calls | Cost |
|------|-------|------|
${laneBreakdown || '| _No data_ | — | — |'}

## Top Models by Cost
${modelBreakdown || '_No usage recorded._'}

---
_Auto-generated by FinOps Weekly Report on ${new Date().toISOString()}_
`;

  console.log(content);

  // ── Post to Mission Control ──
  const mcResult = await postMCDoc({
    title: `FinOps Weekly — ${startStr} to ${endStr}`,
    content,
    category: 'plans',
    lane: 'FlashFlow',
    tags: ['finops', 'cost', 'usage', 'weekly'],
  });

  console.log(`[finops/weekly-report] MC posted: ${mcResult.ok}${mcResult.id ? ` (id: ${mcResult.id})` : ''}`);
}

const endDate = process.argv[2] || new Date().toISOString().slice(0, 10);
run(endDate).catch(err => {
  console.error('[finops/weekly-report] Fatal:', err);
  process.exit(1);
});
