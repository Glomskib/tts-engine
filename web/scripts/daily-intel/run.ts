#!/usr/bin/env tsx
/**
 * Daily Intel Pipeline — CLI runner.
 *
 * Usage:
 *   pnpm run job:daily-intel
 *   pnpm run job:daily-intel -- --dry-run
 *   pnpm run job:daily-intel -- --pipeline cycling
 *   pnpm run job:daily-intel -- --pipeline eds
 *   pnpm run job:daily-intel -- --pipeline cycling --dry-run
 *
 * Requires env vars: ANTHROPIC_API_KEY, MC_API_TOKEN
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import type { PipelineConfig, PipelineResult } from './lib/types';
import { fetchAllSources } from './lib/feed-fetcher';
import { generateIntelReport } from './lib/intel-generator';
import { generateSocialDrafts } from './lib/social-drafter';
import { postToMC } from './lib/mc-poster';
import { pushToBuffer } from './lib/buffer-client';
import { cyclingPipeline } from './pipelines/cycling';
import { edsPipeline } from './pipelines/eds';

const TAG = '[daily-intel]';

function parseArgs(): { pipelines: PipelineConfig[]; dryRun: boolean } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  let pipelines: PipelineConfig[] = [cyclingPipeline, edsPipeline];
  const pipelineIdx = args.indexOf('--pipeline');
  if (pipelineIdx !== -1 && args[pipelineIdx + 1]) {
    const id = args[pipelineIdx + 1];
    if (id === 'cycling') pipelines = [cyclingPipeline];
    else if (id === 'eds') pipelines = [edsPipeline];
    else {
      console.error(`${TAG} Unknown pipeline: ${id}. Use 'cycling' or 'eds'.`);
      process.exit(1);
    }
  }

  return { pipelines, dryRun };
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function runPipeline(cfg: PipelineConfig, dryRun: boolean): Promise<PipelineResult> {
  const result: PipelineResult = {
    pipeline: cfg.name,
    articlesFound: 0,
    bufferPushed: false,
    warnings: [],
    errors: [],
    log: [],
  };
  const log = (msg: string) => {
    const line = `${TAG}[${cfg.id}] ${msg}`;
    result.log.push(line);
    console.log(line);
  };

  const date = todayDate();

  // 1. Fetch sources
  log('Fetching sources...');
  const { articles, errors: fetchErrors } = await fetchAllSources(cfg.sources);
  result.articlesFound = articles.length;
  result.warnings.push(...fetchErrors);
  for (const e of fetchErrors) log(`  WARN: ${e}`);
  log(`  Found ${articles.length} articles from ${cfg.sources.length} sources`);

  if (articles.length === 0) {
    log('No articles found — skipping generation');
    return result;
  }

  // 2. Generate intel report
  log('Generating intel report...');
  const intelReport = await generateIntelReport(articles, cfg.intelPrompt);
  log(`  Report generated (${intelReport.length} chars)`);

  // 3. Generate social drafts
  log('Generating social drafts...');
  const { markdown: draftsMarkdown, drafts } = await generateSocialDrafts(intelReport, cfg.socialPrompt);
  log(`  Generated ${drafts.length} drafts`);

  if (dryRun) {
    log('DRY RUN — skipping MC posts and Buffer push');
    log('--- Intel Report Preview ---');
    console.log(intelReport.slice(0, 500) + '...');
    log('--- Social Drafts Preview ---');
    console.log(draftsMarkdown.slice(0, 500) + '...');
    return result;
  }

  // 4. Post intel doc to MC
  log('Posting intel doc to Mission Control...');
  const intelResult = await postToMC({
    title: cfg.intelDocTitle(date),
    content: intelReport,
    category: 'intelligence',
    lane: cfg.lane,
    tags: cfg.intelTags,
  });
  if (intelResult.ok) {
    result.intelDocId = intelResult.id;
    log(`  Intel doc posted: ${intelResult.id}`);
  } else {
    result.errors.push(`MC intel post failed: ${intelResult.error}`);
    log(`  WARN: Intel post failed: ${intelResult.error}`);
  }

  // 5. Post drafts doc to MC
  log('Posting drafts doc to Mission Control...');
  const draftsResult = await postToMC({
    title: cfg.draftsDocTitle(date),
    content: draftsMarkdown,
    category: 'drafts',
    lane: cfg.lane,
    tags: cfg.draftsTags,
  });
  if (draftsResult.ok) {
    result.draftsDocId = draftsResult.id;
    log(`  Drafts doc posted: ${draftsResult.id}`);
  } else {
    result.errors.push(`MC drafts post failed: ${draftsResult.error}`);
    log(`  WARN: Drafts post failed: ${draftsResult.error}`);
  }

  // 6. Optional: push to Buffer
  if (process.env.BUFFER_ACCESS_TOKEN) {
    log('Pushing drafts to Buffer...');
    const bufferResult = await pushToBuffer(drafts);
    result.bufferPushed = bufferResult.ok;
    if (bufferResult.errors.length > 0) {
      result.errors.push(...bufferResult.errors);
      for (const e of bufferResult.errors) log(`  WARN: ${e}`);
    }
    log(`  Buffer: ${bufferResult.pushed} posts queued`);
  } else {
    log('Buffer not configured — skipping');
  }

  return result;
}

async function main() {
  const { pipelines, dryRun } = parseArgs();

  console.log(`${TAG} Starting at ${new Date().toISOString()}`);
  console.log(`${TAG} Pipelines: ${pipelines.map(p => p.id).join(', ')}`);
  console.log(`${TAG} Dry run: ${dryRun}`);

  // Validate required env vars
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${TAG} ERROR: ANTHROPIC_API_KEY not set`);
    process.exit(1);
  }

  const results: PipelineResult[] = [];
  let totalErrors = 0;

  for (const cfg of pipelines) {
    try {
      const result = await runPipeline(cfg, dryRun);
      results.push(result);
      totalErrors += result.errors.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${TAG}[${cfg.id}] Fatal error: ${msg}`);
      totalErrors++;
    }
  }

  // Summary
  console.log(`\n${TAG} === Summary ===`);
  for (const r of results) {
    console.log(`${TAG} ${r.pipeline}: ${r.articlesFound} articles, intel=${r.intelDocId ?? 'n/a'}, drafts=${r.draftsDocId ?? 'n/a'}, buffer=${r.bufferPushed}, warnings=${r.warnings.length}, errors=${r.errors.length}`);
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(1);
});
