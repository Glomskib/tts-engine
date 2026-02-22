/**
 * Cron: FinOps Weekly — Every Monday at 6:30 AM UTC
 *
 * Aggregates the past 7 days and posts a weekly cost summary to MC.
 * Schedule: 30 6 * * 1 (vercel.json)
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

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const endDate = new Date(now.getTime() - 86400000); // yesterday
    const startDate = new Date(endDate.getTime() - 6 * 86400000);
    const endStr = endDate.toISOString().slice(0, 10);
    const startStr = startDate.toISOString().slice(0, 10);

    const { data: rows } = await supabaseAdmin
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

    // Daily spend
    const dailyMap = new Map<string, number>();
    for (const r of allRows) {
      dailyMap.set(r.day, (dailyMap.get(r.day) ?? 0) + Number(r.cost_usd));
    }
    const dailyBreakdown = [...dailyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, cost]) => `| ${day} | ${fmt(cost)} |`)
      .join('\n');

    // Lane breakdown
    const laneMap = new Map<string, { cost: number; calls: number }>();
    for (const r of allRows) {
      const entry = laneMap.get(r.lane) ?? { cost: 0, calls: 0 };
      entry.cost += Number(r.cost_usd);
      entry.calls += r.calls;
      laneMap.set(r.lane, entry);
    }
    const laneBreakdown = [...laneMap.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([lane, d]) => `| ${lane} | ${fmtInt(d.calls)} | ${fmt(d.cost)} |`)
      .join('\n');

    // Model breakdown
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

    // Previous week comparison
    const prevEnd = new Date(startDate.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - 6 * 86400000);
    const { data: prevRows } = await supabaseAdmin
      .from('ff_usage_rollups_daily')
      .select('cost_usd')
      .gte('day', prevStart.toISOString().slice(0, 10))
      .lte('day', prevEnd.toISOString().slice(0, 10));

    const prevTotal = (prevRows ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
    const wowChange = prevTotal > 0
      ? `${((weekTotal / prevTotal - 1) * 100).toFixed(1)}% ${weekTotal > prevTotal ? 'increase' : 'decrease'}`
      : 'N/A (no previous week data)';

    // ── Recommendations ──
    const recommendations: string[] = [];

    // Sonnet vs Opus analysis
    const opusModels = [...modelMap.entries()].filter(([k]) => k.includes('opus'));
    const sonnetModels = [...modelMap.entries()].filter(([k]) => k.includes('sonnet'));
    const opusCost = opusModels.reduce((s, [, d]) => s + d.cost, 0);
    const opusCalls = opusModels.reduce((s, [, d]) => s + d.calls, 0);
    const sonnetCost = sonnetModels.reduce((s, [, d]) => s + d.cost, 0);
    const sonnetCalls = sonnetModels.reduce((s, [, d]) => s + d.calls, 0);

    if (opusCost > 0 && sonnetCost > 0) {
      const opusAvg = opusCost / opusCalls;
      const sonnetAvg = sonnetCost / sonnetCalls;
      const ratio = opusAvg / sonnetAvg;
      recommendations.push(
        `**Sonnet vs Opus:** Opus averaging ${fmt(opusAvg)}/call vs Sonnet ${fmt(sonnetAvg)}/call (${ratio.toFixed(1)}x). ` +
        (opusCost > sonnetCost * 2
          ? 'Consider moving non-critical Opus tasks to Sonnet for savings.'
          : 'Mix looks reasonable.')
      );
    } else if (opusCost > 0) {
      recommendations.push(`**Opus-only usage:** ${fmtInt(opusCalls)} calls at ${fmt(opusCost)}. Consider Sonnet for lower-stakes tasks.`);
    }

    // Identify high-cost low-call models (expensive one-offs)
    const expensiveOneOffs = [...modelMap.entries()]
      .filter(([, d]) => d.calls <= 5 && d.cost > 0.50)
      .sort((a, b) => b[1].cost - a[1].cost);
    if (expensiveOneOffs.length > 0) {
      const top = expensiveOneOffs[0];
      recommendations.push(
        `**Expensive low-volume:** ${top[0]} had only ${top[1].calls} calls but cost ${fmt(top[1].cost)}. Review if a cheaper model works.`
      );
    }

    // GPT-4o vs GPT-4o-mini comparison
    const gpt4oData = modelMap.get('openai/gpt-4o');
    const gpt4oMiniData = modelMap.get('openai/gpt-4o-mini');
    if (gpt4oData && gpt4oMiniData && gpt4oData.cost > gpt4oMiniData.cost) {
      recommendations.push(
        `**GPT-4o vs Mini:** GPT-4o spent ${fmt(gpt4oData.cost)} (${fmtInt(gpt4oData.calls)} calls) vs Mini ${fmt(gpt4oMiniData.cost)} (${fmtInt(gpt4oMiniData.calls)} calls). ` +
        'Evaluate if GPT-4o quality uplift justifies the cost difference.'
      );
    }

    // Week-over-week spike
    if (prevTotal > 0 && weekTotal > prevTotal * 1.3) {
      const pctIncrease = ((weekTotal / prevTotal - 1) * 100).toFixed(0);
      recommendations.push(
        `**Spend trending up** ${pctIncrease}% WoW. Review new endpoints or increased volume.`
      );
    } else if (prevTotal > 0 && weekTotal < prevTotal * 0.7) {
      recommendations.push('**Spend dropped significantly** — verify no broken generation pipelines.');
    }

    if (recommendations.length === 0) {
      recommendations.push('No specific recommendations this week — spend looks healthy.');
    }

    const recommendationsSection = recommendations.map(r => `- ${r}`).join('\n');

    const content = `# FinOps Weekly — ${startStr} to ${endStr}

## Summary
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

## Recommendations
${recommendationsSection}

---
_Auto-generated by FinOps Weekly cron on ${now.toISOString()}_
`;

    const mcResult = await postMCDoc({
      title: `FinOps Weekly — ${startStr} to ${endStr}`,
      content,
      category: 'plans',
      lane: 'FlashFlow',
      tags: ['finops', 'cost', 'usage', 'weekly'],
    });

    console.log(`[cron/finops-weekly] Done. Cost: ${fmt(weekTotal)}, MC: ${mcResult.ok}`);

    return NextResponse.json({
      ok: true,
      period: `${startStr} to ${endStr}`,
      total_cost: weekTotal,
      total_calls: weekCalls,
      wow_change: wowChange,
      mc_posted: mcResult.ok,
      mc_doc_id: mcResult.id ?? null,
    });
  } catch (err) {
    console.error('[cron/finops-weekly] Fatal:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
