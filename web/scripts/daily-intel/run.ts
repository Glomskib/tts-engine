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
 * Outputs per pipeline:
 *   1. Intel doc → MC (lane-specific, category=intelligence)
 *   2. Drafts doc → MC (lane-specific, category=drafts)
 *   3. Local export → ~/DailyDrafts/YYYY-MM-DD/{cycling,eds}/
 *
 * Graceful degradation:
 *   - Missing ANTHROPIC_API_KEY → skip generation, still report fetched articles
 *   - Missing MC_API_TOKEN → skip MC posts, still export locally
 *   - Source fetch failures → non-fatal, report and continue
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import type { PipelineConfig, PipelineResult } from './lib/types';
import { fetchAllSources } from './lib/feed-fetcher';
import { generateIntelReport } from './lib/intel-generator';
import { generateSocialDrafts } from './lib/social-drafter';
import { postToMC } from './lib/mc-poster';
import { exportDrafts } from './lib/draft-exporter';
import { enqueueBatch, generateRunId } from '../../lib/marketing/queue';
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
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasMCToken = !!(process.env.MC_API_TOKEN || process.env.MISSION_CONTROL_TOKEN || process.env.MISSION_CONTROL_AGENT_TOKEN);

  // 1. Fetch sources
  log('Fetching sources...');
  const { articles, errors: fetchErrors } = await fetchAllSources(cfg.sources);
  result.articlesFound = articles.length;
  result.warnings.push(...fetchErrors);
  for (const e of fetchErrors) log(`  WARN: ${e}`);

  const dateUnknown = articles.filter(a => a.freshness === 'date_unknown').length;
  const fresh = articles.filter(a => a.freshness === 'fresh').length;
  log(`  Found ${articles.length} articles (${fresh} fresh, ${dateUnknown} date_unknown) from ${cfg.sources.length} sources`);

  if (articles.length === 0) {
    log('No articles found — skipping generation');
    return result;
  }

  // 2. Generate intel report (graceful skip if no API key)
  let intelReport = '';
  let draftsMarkdown = '';
  let drafts: { platform: string; content: string }[] = [];

  if (!hasAnthropicKey) {
    log('WARN: ANTHROPIC_API_KEY not set — skipping AI generation, exporting article list only');
    result.warnings.push('ANTHROPIC_API_KEY not set — generation skipped');

    // Build a minimal article-list report
    intelReport = `# Daily ${cfg.name} Intel — ${date}\n\n> AI generation skipped (ANTHROPIC_API_KEY not set)\n\n## Articles Fetched (${articles.length})\n\n`;
    intelReport += articles.map((a, i) => {
      let line = `${i + 1}. **${a.title}**\n   - Source: ${a.source}\n   - URL: ${a.url}`;
      if (a.freshness === 'date_unknown') line += '\n   - Date: unknown';
      else if (a.publishedAt) line += `\n   - Published: ${a.publishedAt}`;
      return line;
    }).join('\n\n');

    draftsMarkdown = `# Drafts — ${cfg.name} — ${date}\n\n> No drafts generated (ANTHROPIC_API_KEY not set). Use article list above for manual drafting.`;
  } else {
    log('Generating intel report...');
    intelReport = await generateIntelReport(articles, cfg.intelPrompt);
    log(`  Report generated (${intelReport.length} chars)`);

    log('Generating social drafts...');
    const draftResult = await generateSocialDrafts(intelReport, cfg.socialPrompt);
    draftsMarkdown = draftResult.markdown;
    drafts = draftResult.drafts;
    log(`  Generated ${drafts.length} drafts`);
  }

  // 3. Export locally (always, even in dry-run)
  log('Exporting drafts locally...');
  const exportResult = exportDrafts({
    pipelineId: cfg.id,
    date,
    intelMarkdown: intelReport,
    draftsMarkdown,
    draftsJson: drafts.map(d => ({ platform: d.platform, content: d.content })),
  });
  log(`  Exported to ${exportResult.dir} (${exportResult.files.length} files)`);

  if (dryRun) {
    log('DRY RUN — skipping MC posts and Buffer push');
    log('--- Intel Report Preview ---');
    console.log(intelReport.slice(0, 800) + (intelReport.length > 800 ? '\n...' : ''));
    log('--- Social Drafts Preview ---');
    console.log(draftsMarkdown.slice(0, 800) + (draftsMarkdown.length > 800 ? '\n...' : ''));
    return result;
  }

  // 4. Post intel doc to MC
  if (!hasMCToken) {
    log('WARN: No MC token found — skipping MC posts');
    result.warnings.push('MC token not configured — MC posts skipped');
  } else {
    log('Posting intel doc to Mission Control...');
    const intelResult = await postToMC({
      title: cfg.intelDocTitle(date),
      content: intelReport,
      category: 'intelligence',
      lane: cfg.lane,
      tags: [...cfg.intelTags, 'daily-intel'],
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
      tags: [...cfg.draftsTags, 'daily-intel', 'drafts'],
    });
    if (draftsResult.ok) {
      result.draftsDocId = draftsResult.id;
      log(`  Drafts doc posted: ${draftsResult.id}`);
    } else {
      result.errors.push(`MC drafts post failed: ${draftsResult.error}`);
      log(`  WARN: Drafts post failed: ${draftsResult.error}`);
    }
  }

  // 6. Queue drafts for marketing scheduler (replaces Buffer)
  if (drafts.length > 0) {
    const runId = generateRunId(`daily-intel-${cfg.id}`);
    log(`Queueing ${drafts.length} drafts for marketing scheduler [run_id=${runId}]...`);
    try {
      const queueResult = await enqueueBatch(drafts, {
        brand: cfg.lane,
        source: `daily-intel-${cfg.id}`,
        run_id: runId,
      });
      result.bufferPushed = queueResult.ok;
      if (queueResult.errors.length > 0) {
        result.errors.push(...queueResult.errors);
        for (const e of queueResult.errors) log(`  WARN: ${e}`);
      }
      log(`  Marketing queue: ${queueResult.queued} posts queued, ${queueResult.skipped} skipped [run_id=${runId}]`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`  WARN: Marketing queue failed (non-fatal): ${msg}`);
      result.warnings.push(`Marketing queue failed: ${msg}`);
    }
  }

  return result;
}

async function main() {
  const { pipelines, dryRun } = parseArgs();

  console.log(`${TAG} Starting at ${new Date().toISOString()}`);
  console.log(`${TAG} Pipelines: ${pipelines.map(p => p.id).join(', ')}`);
  console.log(`${TAG} Dry run: ${dryRun}`);

  // Check env vars — warn but don't hard-exit for graceful degradation
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(`${TAG} WARN: ANTHROPIC_API_KEY not set — will skip AI generation`);
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
      try {
        const { captureRouteError } = await import('@/lib/errorTracking');
        captureRouteError(err instanceof Error ? err : new Error(msg), {
          route: 'scripts/daily-intel/run',
          feature: 'daily-intel',
          pipeline: cfg.id,
        });
      } catch { /* Sentry unavailable — non-fatal */ }
      console.error(`${TAG}[${cfg.id}] Fatal error: ${msg}`);
      totalErrors++;
    }
  }

  // Summary
  console.log(`\n${TAG} === Summary ===`);
  for (const r of results) {
    console.log(`${TAG} ${r.pipeline}: ${r.articlesFound} articles, intel=${r.intelDocId ?? 'n/a'}, drafts=${r.draftsDocId ?? 'n/a'}, buffer=${r.bufferPushed}, warnings=${r.warnings.length}, errors=${r.errors.length}`);
    if (r.warnings.length > 0) {
      for (const w of r.warnings) console.log(`${TAG}   warn: ${w}`);
    }
    if (r.errors.length > 0) {
      for (const e of r.errors) console.log(`${TAG}   error: ${e}`);
    }
  }

  // Exit 0 if we at least fetched articles (even if generation was skipped)
  const anyArticles = results.some(r => r.articlesFound > 0);
  process.exit(totalErrors > 0 && !anyArticles ? 1 : 0);
}

main().catch(async (err) => {
  try {
    const { captureRouteError } = await import('@/lib/errorTracking');
    captureRouteError(err instanceof Error ? err : new Error(String(err)), {
      route: 'scripts/daily-intel/run',
      feature: 'daily-intel',
      severity: 'fatal',
    });
  } catch { /* Sentry unavailable — non-fatal */ }
  console.error(`${TAG} Fatal error:`, err);
  process.exit(1);
});
