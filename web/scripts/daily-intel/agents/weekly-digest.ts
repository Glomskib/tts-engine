#!/usr/bin/env tsx
/**
 * Weekly Intel Digest — reads past 7 days of intel from both lanes,
 * generates a digest with trending topics + suggested posts, posts to MC.
 *
 * Usage:
 *   pnpm run job:weekly-digest
 *   pnpm run job:weekly-digest:dry
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { getRecentIntelDocs } from '../lib/mc-reader';
import { callHaiku } from '../lib/haiku-client';
import { postToMC } from '../lib/mc-poster';

const TAG = '[weekly-digest]';
const LANES = ['Making Miles Matter', "Zebby's World"];
const MAX_DOC_CHARS = 2000;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const SYSTEM_PROMPT = `You are a strategic content analyst for FlashFlow, a platform that manages two content lanes:
1. "Making Miles Matter" — cycling culture, community rides, advocacy
2. "Zebby's World" — EDS/POTS/dysautonomia awareness and education

You will receive the past week's intel reports from both lanes.

Produce a weekly digest in markdown with these sections:

## Trending Topics
- Key themes that appeared across multiple days or both lanes
- Note which lane(s) each trend appeared in

## Suggested Posts
- 5-8 specific post ideas across both lanes
- For each: target lane, platform, angle, and a one-line hook

## Recurring Themes
- Patterns worth watching over time (emerging stories, growing community topics)

## Content Calendar Recommendations
- Suggested posting cadence for the coming week
- Any time-sensitive topics to prioritize
- Gaps in coverage to fill

Keep it actionable and concise. This is for the content team to plan the week ahead.`;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const date = todayDate();

  console.log(`${TAG} Starting at ${new Date().toISOString()}`);
  console.log(`${TAG} Dry run: ${dryRun}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${TAG} ERROR: ANTHROPIC_API_KEY not set`);
    process.exit(1);
  }

  // 1. Read past 7 days of intel from both lanes
  console.log(`${TAG} Fetching recent intel docs...`);
  const allDocs: { lane: string; title: string; content: string }[] = [];

  for (const lane of LANES) {
    console.log(`${TAG}   Fetching "${lane}"...`);
    const docs = await getRecentIntelDocs(lane, 7);
    console.log(`${TAG}   Found ${docs.length} docs for "${lane}"`);
    for (const doc of docs) {
      allDocs.push({
        lane,
        title: doc.title,
        content: doc.content.slice(0, MAX_DOC_CHARS),
      });
    }
  }

  if (allDocs.length === 0) {
    console.error(`${TAG} No intel docs found in the past 7 days. Nothing to digest.`);
    process.exit(1);
  }

  console.log(`${TAG} Total docs collected: ${allDocs.length}`);

  // 2. Build user message with all docs
  const userMessage = allDocs.map(d =>
    `### ${d.title} (${d.lane})\n\n${d.content}`
  ).join('\n\n---\n\n');

  // 3. Generate digest via Haiku
  console.log(`${TAG} Generating weekly digest...`);
  const digest = await callHaiku(
    SYSTEM_PROMPT,
    `Here are the past week's intel reports:\n\n${userMessage}`,
    { maxTokens: 4096 },
  );
  console.log(`${TAG} Digest generated (${digest.length} chars)`);

  // 4. Append cost summary section from FinOps data
  let costSection = '';
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (sbUrl && sbKey) {
      const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
      const end = new Date();
      const start = new Date(end.getTime() - 6 * 86400000);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      const monthStart = endStr.slice(0, 8) + '01';

      const { data: weekRows } = await sb
        .from('ff_usage_rollups_daily')
        .select('day, lane, provider, model, calls, input_tokens, output_tokens, cost_usd')
        .gte('day', startStr)
        .lte('day', endStr);

      const { data: mtdRows } = await sb
        .from('ff_usage_rollups_daily')
        .select('cost_usd')
        .gte('day', monthStart)
        .lte('day', endStr);

      const rows = weekRows ?? [];
      const weekTotal = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
      const weekCalls = rows.reduce((s, r) => s + r.calls, 0);
      const mtdTotal = (mtdRows ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);

      // By lane
      const laneMap = new Map<string, { cost: number; calls: number }>();
      for (const r of rows) {
        const e = laneMap.get(r.lane) ?? { cost: 0, calls: 0 };
        e.cost += Number(r.cost_usd);
        e.calls += r.calls;
        laneMap.set(r.lane, e);
      }
      const laneLines = [...laneMap.entries()]
        .sort((a, b) => b[1].cost - a[1].cost)
        .map(([l, d]) => `| ${l} | ${d.calls} | $${d.cost.toFixed(4)} |`)
        .join('\n');

      // By model
      const modelMap = new Map<string, { cost: number; calls: number }>();
      for (const r of rows) {
        const key = `${r.provider}/${r.model}`;
        const e = modelMap.get(key) ?? { cost: 0, calls: 0 };
        e.cost += Number(r.cost_usd);
        e.calls += r.calls;
        modelMap.set(key, e);
      }
      const modelLines = [...modelMap.entries()]
        .sort((a, b) => b[1].cost - a[1].cost)
        .slice(0, 5)
        .map(([m, d]) => `| ${m} | ${d.calls} | $${d.cost.toFixed(4)} |`)
        .join('\n');

      costSection = `\n\n---\n\n## Cost Summary (FinOps)\n\n| Metric | Value |\n|--------|-------|\n| 7-day total | $${weekTotal.toFixed(4)} |\n| 7-day calls | ${weekCalls.toLocaleString()} |\n| MTD total | $${mtdTotal.toFixed(4)} |\n\n### By Lane\n| Lane | Calls | Cost |\n|------|-------|------|\n${laneLines || '| _No data_ | — | — |'}\n\n### Top Models\n| Model | Calls | Cost |\n|-------|-------|------|\n${modelLines || '| _No data_ | — | — |'}`;

      console.log(`${TAG} Cost summary appended (7d: $${weekTotal.toFixed(4)}, MTD: $${mtdTotal.toFixed(4)})`);
    } else {
      console.log(`${TAG} Skipping cost summary — Supabase env vars not set`);
    }
  } catch (err) {
    console.warn(`${TAG} Cost summary failed (non-fatal):`, err);
  }

  const fullDigest = digest + costSection;

  if (dryRun) {
    console.log(`${TAG} DRY RUN — preview:\n`);
    console.log(fullDigest);
    console.log(`\n${TAG} Done (dry run).`);
    return;
  }

  // 5. Post to MC
  console.log(`${TAG} Posting digest to Mission Control...`);
  const mcResult = await postToMC({
    title: `Weekly Intel Digest — ${date}`,
    content: fullDigest,
    category: 'intelligence',
    lane: 'FlashFlow',
    tags: ['weekly-digest', 'intel-summary'],
  });
  if (mcResult.ok) {
    console.log(`${TAG} MC doc posted: ${mcResult.id}`);
  } else {
    console.error(`${TAG} MC post failed: ${mcResult.error}`);
  }

  console.log(`${TAG} Done.`);
}

main().catch((err) => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(1);
});
