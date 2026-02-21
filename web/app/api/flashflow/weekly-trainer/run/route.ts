/**
 * POST /api/flashflow/weekly-trainer/run
 *
 * Pulls last 7 days of generations + outcomes, computes aggregates,
 * and posts a "FlashFlow Weekly Trainer" doc to Mission Control.
 *
 * Admin-only. Designed to be called manually or by a cron job.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { postMCDoc } from '@/lib/flashflow/mission-control';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface GenRow {
  id: string;
  template_id: string | null;
  prompt_version: string | null;
  prompt_version_id: string | null;
  status: string;
  output_text: string | null;
  created_at: string;
}

interface OutcomeRow {
  generation_id: string;
  rating: number | null;
  is_winner: boolean;
  is_rejected: boolean;
  is_regenerated: boolean;
  views: number;
  orders: number;
  revenue_cents: number;
  winner_score: number | null;
  feedback_text: string | null;
  tags: string[];
}

export async function POST(request: Request) {
  const correlationId =
    request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  // Date range: last 7 days
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const startDate = `${start}T00:00:00Z`;
  const endDate = `${end}T23:59:59Z`;

  // ── Fetch data ──────────────────────────────────────────────

  const { data: generations, error: genErr } = await supabaseAdmin
    .from('ff_generations')
    .select('id, template_id, prompt_version, prompt_version_id, status, output_text, created_at')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  if (genErr) {
    return createApiErrorResponse('DB_ERROR', genErr.message, 500, correlationId);
  }

  const gens = (generations ?? []) as GenRow[];
  const genIds = gens.map(g => g.id);

  let outcomes: OutcomeRow[] = [];
  if (genIds.length > 0) {
    const { data: oc, error: ocErr } = await supabaseAdmin
      .from('ff_outcomes')
      .select('generation_id, rating, is_winner, is_rejected, is_regenerated, views, orders, revenue_cents, winner_score, feedback_text, tags')
      .in('generation_id', genIds);

    if (ocErr) {
      return createApiErrorResponse('DB_ERROR', ocErr.message, 500, correlationId);
    }
    outcomes = (oc ?? []) as OutcomeRow[];
  }

  // ── Compute aggregates ──────────────────────────────────────

  const totalGen = gens.length;
  const rejectedCount = outcomes.filter(o => o.is_rejected).length;
  const regenCount = outcomes.filter(o => o.is_regenerated).length;
  const winnersCount = outcomes.filter(o => o.is_winner).length;

  const ratings = outcomes
    .map(o => o.rating)
    .filter((r): r is number => r !== null);
  const avgRating = ratings.length > 0
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : null;

  const regenRate = totalGen > 0 ? regenCount / totalGen : 0;
  const rejectRate = totalGen > 0 ? rejectedCount / totalGen : 0;

  // Score helper: winner_score, or fallback rating + views/1000
  function score(o: OutcomeRow): number {
    return o.winner_score ?? ((o.rating ?? 0) + o.views / 1000);
  }

  // Top 10 winners
  const top10 = [...outcomes]
    .filter(o => o.is_winner || (o.rating !== null && o.rating >= 4))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 10);

  // Bottom 10 losers
  const bottom10 = [...outcomes]
    .filter(o => o.is_rejected || (o.rating !== null && o.rating <= 2))
    .sort((a, b) => score(a) - score(b))
    .slice(0, 10);

  // Template + prompt_version breakdown
  const templateMap = new Map<string, {
    total: number; winners: number; rejected: number;
    prompt_versions: Set<string>;
  }>();

  for (const gen of gens) {
    const tid = gen.template_id ?? 'unknown';
    let entry = templateMap.get(tid);
    if (!entry) {
      entry = { total: 0, winners: 0, rejected: 0, prompt_versions: new Set() };
      templateMap.set(tid, entry);
    }
    entry.total++;
    if (gen.prompt_version) entry.prompt_versions.add(gen.prompt_version);

    const oc = outcomes.find(o => o.generation_id === gen.id);
    if (oc?.is_winner) entry.winners++;
    if (oc?.is_rejected) entry.rejected++;
  }

  // Best/worst template by win rate
  let bestTemplate = '';
  let worstTemplate = '';
  let bestRate = -1;
  let worstRate = 2;

  for (const [tid, stats] of templateMap) {
    if (stats.total < 2) continue; // skip low-volume
    const winRate = stats.winners / stats.total;
    const rejRate = stats.rejected / stats.total;
    if (winRate > bestRate) { bestRate = winRate; bestTemplate = tid; }
    if (rejRate < worstRate || (rejRate === worstRate && stats.total > (templateMap.get(worstTemplate)?.total ?? 0))) {
      // Actually we want worst = highest reject rate
    }
    if (rejRate > (1 - worstRate)) { worstRate = 1 - rejRate; worstTemplate = tid; }
  }

  // Simpler approach for worst
  worstTemplate = '';
  let highestRejectRate = -1;
  for (const [tid, stats] of templateMap) {
    if (stats.total < 2) continue;
    const rejRate = stats.rejected / stats.total;
    if (rejRate > highestRejectRate) {
      highestRejectRate = rejRate;
      worstTemplate = tid;
    }
  }

  // ── Build report markdown ───────────────────────────────────

  function genLink(o: OutcomeRow): string {
    const gen = gens.find(g => g.id === o.generation_id);
    const tmpl = gen?.template_id ?? '?';
    const pv = gen?.prompt_version ?? '?';
    return `\`${o.generation_id.slice(0, 8)}\` (${tmpl} v${pv})`;
  }

  const winnersSection = top10.length > 0
    ? top10.map((o, i) =>
      `${i + 1}. ${genLink(o)} — score ${score(o).toFixed(1)}, rating ${o.rating ?? '-'}, ${o.views} views, ${o.orders} orders`
    ).join('\n')
    : '_No winners this period._';

  const losersSection = bottom10.length > 0
    ? bottom10.map((o, i) =>
      `${i + 1}. ${genLink(o)} — score ${score(o).toFixed(1)}, rating ${o.rating ?? '-'}, feedback: ${o.feedback_text ?? 'none'}`
    ).join('\n')
    : '_No losers flagged this period._';

  const templateBreakdown = Array.from(templateMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([tid, s]) =>
      `- **${tid}** (versions: ${[...s.prompt_versions].join(', ') || '-'}): ${s.total} gens, ${s.winners} winners, ${s.rejected} rejected`
    ).join('\n');

  const recommendations: string[] = [];
  if (regenRate > 0.3) {
    recommendations.push(`- High regen rate (${(regenRate * 100).toFixed(1)}%). Review prompts for the most regenerated templates.`);
  }
  if (rejectRate > 0.2) {
    recommendations.push(`- High reject rate (${(rejectRate * 100).toFixed(1)}%). Investigate common rejection feedback tags.`);
  }
  if (bestTemplate) {
    const bs = templateMap.get(bestTemplate)!;
    recommendations.push(`- Best performing template: **${bestTemplate}** (${((bs.winners / bs.total) * 100).toFixed(0)}% win rate). Consider using its prompt patterns in other templates.`);
  }
  if (worstTemplate && worstTemplate !== bestTemplate) {
    const ws = templateMap.get(worstTemplate)!;
    recommendations.push(`- Worst performing template: **${worstTemplate}** (${((ws.rejected / ws.total) * 100).toFixed(0)}% reject rate). Prompt revision recommended.`);
  }
  if (avgRating !== null && avgRating < 3.0) {
    recommendations.push(`- Average rating ${avgRating.toFixed(2)} is below 3.0. General prompt quality improvement needed.`);
  }
  if (recommendations.length === 0) {
    recommendations.push('- No urgent action items. Continue monitoring.');
  }

  const content = `# FlashFlow Weekly Trainer — ${end}

## Period
${start} to ${end}

## Summary
| Metric | Value |
|--------|-------|
| Total generations | ${totalGen} |
| Winners | ${winnersCount} |
| Rejected | ${rejectedCount} |
| Regenerated | ${regenCount} |
| Regen rate | ${(regenRate * 100).toFixed(1)}% |
| Reject rate | ${(rejectRate * 100).toFixed(1)}% |
| Avg rating | ${avgRating !== null ? avgRating.toFixed(2) : 'N/A'} |

## Top 10 Winners
${winnersSection}

## Bottom 10 Losers
${losersSection}

## Template Breakdown
${templateBreakdown || '_No templates tracked yet._'}

## Recommended Actions
${recommendations.join('\n')}

---
_Auto-generated by FlashFlow Weekly Trainer on ${new Date().toISOString()}_
`;

  // ── Post to Mission Control ─────────────────────────────────

  const mcResult = await postMCDoc({
    title: `FlashFlow Weekly Trainer — ${end}`,
    content,
    category: 'plans',
    lane: 'FlashFlow',
    tags: ['weekly-trainer', 'prompt-optimization'],
  });

  // ── Prompt Tuning Recommendations (separate MC doc) ───────

  // Group generations by prompt_version_id for templates that have PromptOps versions
  interface PVStats {
    template_id: string;
    prompt_version_id: string;
    total: number;
    winners: number;
    rejected: number;
    regenerated: number;
    ratings: number[];
    rejectionTags: string[];
  }

  const pvMap = new Map<string, PVStats>();
  const templateVersions = new Map<string, Set<string>>();

  for (const gen of gens) {
    if (!gen.prompt_version_id) continue;
    const tid = gen.template_id ?? 'unknown';
    const pvid = gen.prompt_version_id;

    let entry = pvMap.get(pvid);
    if (!entry) {
      entry = {
        template_id: tid,
        prompt_version_id: pvid,
        total: 0,
        winners: 0,
        rejected: 0,
        regenerated: 0,
        ratings: [],
        rejectionTags: [],
      };
      pvMap.set(pvid, entry);
    }
    entry.total++;

    const oc = outcomes.find(o => o.generation_id === gen.id);
    if (oc) {
      if (oc.is_winner) entry.winners++;
      if (oc.is_rejected) entry.rejected++;
      if (oc.is_regenerated) entry.regenerated++;
      if (oc.rating !== null) entry.ratings.push(oc.rating);
      if (oc.tags) {
        entry.rejectionTags.push(...oc.tags.filter(t => t.includes('reject') || t.includes('compliance')));
      }
    }

    if (!templateVersions.has(tid)) templateVersions.set(tid, new Set());
    templateVersions.get(tid)!.add(pvid);
  }

  // Build prompt tuning content for templates with multiple versions (top 10 by volume)
  const multiVersionTemplates = Array.from(templateVersions.entries())
    .filter(([, pvids]) => pvids.size > 1)
    .sort((a, b) => {
      const aTotal = Array.from(a[1]).reduce((sum, pvid) => sum + (pvMap.get(pvid)?.total ?? 0), 0);
      const bTotal = Array.from(b[1]).reduce((sum, pvid) => sum + (pvMap.get(pvid)?.total ?? 0), 0);
      return bTotal - aTotal;
    })
    .slice(0, 10);

  const tuningLines: string[] = [];

  for (const [tid, pvids] of multiVersionTemplates) {
    tuningLines.push(`### Template: ${tid}\n`);
    tuningLines.push('| Version ID | Gens | Win Rate | Avg Rating | Reject Rate | Regen Rate |');
    tuningLines.push('|------------|------|----------|------------|-------------|------------|');

    const versions = Array.from(pvids).map(pvid => pvMap.get(pvid)!).sort((a, b) => b.total - a.total);
    let bestWinRate = -1;
    let worstWinRate = 2;
    let bestPvid = '';
    let worstPvid = '';

    for (const v of versions) {
      const winRate = v.total > 0 ? v.winners / v.total : 0;
      const avgR = v.ratings.length > 0 ? (v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length).toFixed(2) : 'N/A';
      const rejR = v.total > 0 ? ((v.rejected / v.total) * 100).toFixed(1) : '0.0';
      const regenR = v.total > 0 ? ((v.regenerated / v.total) * 100).toFixed(1) : '0.0';

      tuningLines.push(`| \`${v.prompt_version_id.slice(0, 8)}\` | ${v.total} | ${(winRate * 100).toFixed(1)}% | ${avgR} | ${rejR}% | ${regenR}% |`);

      if (winRate > bestWinRate) { bestWinRate = winRate; bestPvid = v.prompt_version_id; }
      if (winRate < worstWinRate) { worstWinRate = winRate; worstPvid = v.prompt_version_id; }
    }

    tuningLines.push('');

    // Recommendations
    const winRateDelta = bestWinRate - worstWinRate;
    if (winRateDelta > 0.2 && bestPvid && worstPvid) {
      tuningLines.push(`**Recommendation:** Retire version \`${worstPvid.slice(0, 8)}\` (win rate delta ${(winRateDelta * 100).toFixed(0)}% > 20% threshold). Keep \`${bestPvid.slice(0, 8)}\`.`);
    } else if (bestPvid) {
      tuningLines.push(`**Recommendation:** Continue A/B test — win rate delta (${(winRateDelta * 100).toFixed(0)}%) is below 20% threshold.`);
    }

    // Common rejection tags
    const allRejTags = versions.flatMap(v => v.rejectionTags);
    if (allRejTags.length > 0) {
      const tagCounts = new Map<string, number>();
      for (const tag of allRejTags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
      const topTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const tagList = topTags.map(([t, c]) => '`' + t + '` (' + c + ')').join(', ');
      tuningLines.push(`\n**Common rejection tags:** ${tagList}`);
      tuningLines.push(`**Guardrail suggestion:** Consider adding constraints to address \`${topTags[0][0]}\` in the system prompt or guardrails_json.`);
    }

    tuningLines.push('');
  }

  // Draft variant ideas for single-version templates with high reject rates
  const singleVersionHighReject = Array.from(templateVersions.entries())
    .filter(([, pvids]) => pvids.size === 1)
    .map(([tid, pvids]) => ({ tid, stats: pvMap.get(Array.from(pvids)[0]!)! }))
    .filter(({ stats }) => stats.total >= 3 && stats.rejected / stats.total > 0.2)
    .sort((a, b) => b.stats.total - a.stats.total)
    .slice(0, 5);

  if (singleVersionHighReject.length > 0) {
    tuningLines.push('### Draft Variant Ideas\n');
    tuningLines.push('Templates with a single version and high reject rate (>20%) — consider creating a v2:\n');
    for (const { tid, stats } of singleVersionHighReject) {
      const rejR = ((stats.rejected / stats.total) * 100).toFixed(1);
      tuningLines.push(`- **${tid}** — ${rejR}% reject rate over ${stats.total} gens. Try: shorter system prompt, more specific guardrails, different tone.`);
    }
    tuningLines.push('');
  }

  let tuningMcResult: { ok: boolean; id?: string; error?: string } = { ok: false, error: 'No prompt tuning data' };

  if (pvMap.size > 0) {
    const tuningContent = `# FlashFlow Prompt Tuning — ${end}

## Period
${start} to ${end}

## Prompt Version Comparison
${tuningLines.join('\n') || '_No multi-version templates with PromptOps data this period._'}

---
_Auto-generated by FlashFlow Weekly Trainer on ${new Date().toISOString()}_
`;

    tuningMcResult = await postMCDoc({
      title: `FlashFlow Prompt Tuning — ${end}`,
      content: tuningContent,
      category: 'reports',
      lane: 'FlashFlow',
      tags: ['prompt-tuning', 'weekly-trainer'],
    });
  }

  const res = NextResponse.json({
    ok: true,
    data: {
      period: { start, end },
      total_generations: totalGen,
      winners_count: winnersCount,
      rejected_count: rejectedCount,
      regenerated_count: regenCount,
      regen_rate: Math.round(regenRate * 10000) / 100,
      reject_rate: Math.round(rejectRate * 10000) / 100,
      avg_rating: avgRating !== null ? Math.round(avgRating * 100) / 100 : null,
      best_template: bestTemplate || null,
      worst_template: worstTemplate || null,
      mc_posted: mcResult.ok,
      mc_doc_id: mcResult.id ?? null,
      mc_error: mcResult.error ?? null,
      tuning_mc_posted: tuningMcResult.ok,
      tuning_mc_doc_id: tuningMcResult.id ?? null,
      tuning_mc_error: tuningMcResult.error ?? null,
    },
    correlation_id: correlationId,
  });
  res.headers.set('x-correlation-id', correlationId);
  return res;
}
