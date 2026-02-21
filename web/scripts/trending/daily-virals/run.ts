#!/usr/bin/env tsx
/**
 * Daily Virals Trending — CLI runner.
 *
 * Usage:
 *   npm run trending:daily-virals
 *   npm run trending:daily-virals -- --dry-run
 *
 * Env vars required:
 *   DAILY_VIRALS_EMAIL         Login email
 *   DAILY_VIRALS_PASSWORD      Login password
 *   DAILY_VIRALS_TRENDING_URL  URL of the trending page to scrape
 *
 * Outputs:
 *   web/data/trending/daily-virals/latest.json
 *   web/data/trending/daily-virals/YYYY-MM-DD.json
 *   web/data/trending/daily-virals/latest.csv
 *   web/data/trending/daily-virals/screenshots/YYYY-MM-DD/<rank>-<slug>.png
 *
 * Graceful degradation:
 *   - Missing MC token → skip MC posts, still export locally
 *   - 2FA / CAPTCHA → post BLOCKED doc to MC and stop
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import type { RunConfig, TrendingItem } from './lib/types';
import { scrapeTrending } from './lib/scraper';
import { exportTrending } from './lib/exporter';
import { postToMC, postBlockedDoc } from './lib/mc-poster';

const TAG = '[daily-virals]';

function parseArgs(): RunConfig {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  return {
    dryRun,
    maxItems: dryRun ? 3 : 20,
    skipScreenshots: dryRun,
    date: new Date().toISOString().slice(0, 10),
  };
}

function buildMCDoc(items: TrendingItem[], date: string): string {
  const topList = items.map(item => {
    const metricStr = Object.entries(item.metrics)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ');

    return `### ${item.rank}. ${item.title}
- **Product:** ${item.product_name || '—'}
- **Category:** ${item.category || '—'}
- **Metrics:** ${metricStr || '—'}
- **Hook:** ${item.hook_text || '—'}${item.source_url ? `\n- **Link:** ${item.source_url}` : ''}${item.ai_observation ? `\n- **Observation:** ${item.ai_observation}` : ''}`;
  }).join('\n\n');

  // Pick top 3 as "immediate test" candidates
  const testPicks = items.slice(0, 3).map((item, i) => {
    return `${i + 1}. **${item.title}** — ${item.hook_text || item.product_name || 'No hook captured'}${item.source_url ? ` ([link](${item.source_url}))` : ''}`;
  }).join('\n');

  // Summary bullets
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];
  const withHooks = items.filter(i => i.hook_text).length;
  const withMetrics = items.filter(i => Object.values(i.metrics).some(v => v)).length;

  return `# Daily Virals Trending — ${date}

## Summary
- **${items.length} products** captured from Daily Virals trending
- **Categories:** ${categories.length > 0 ? categories.join(', ') : 'Not categorized'}
- **${withHooks}** items with hook text captured
- **${withMetrics}** items with metrics data
- **Data files:** \`web/data/trending/daily-virals/latest.json\`, \`.csv\`

## Immediate Test Picks

${testPicks}

## Top ${items.length} Trending Products

${topList}

---

*Captured at ${new Date().toISOString()} by Daily Virals scraper.*
`;
}

async function main() {
  const cfg = parseArgs();

  console.log(`${TAG} Starting at ${new Date().toISOString()}`);
  console.log(`${TAG} Date: ${cfg.date}`);
  console.log(`${TAG} Mode: ${cfg.dryRun ? 'DRY RUN (3 items, no screenshots)' : 'FULL (20 items + screenshots)'}`);

  // Check required env vars
  const missing: string[] = [];
  if (!process.env.DAILY_VIRALS_EMAIL) missing.push('DAILY_VIRALS_EMAIL');
  if (!process.env.DAILY_VIRALS_PASSWORD) missing.push('DAILY_VIRALS_PASSWORD');
  if (!process.env.DAILY_VIRALS_TRENDING_URL) missing.push('DAILY_VIRALS_TRENDING_URL');

  if (missing.length > 0) {
    console.error(`${TAG} Missing required env vars: ${missing.join(', ')}`);
    console.error(`${TAG} Add them to web/.env.local`);
    process.exit(1);
  }

  const hasMCToken = !!(process.env.MC_API_TOKEN || process.env.MISSION_CONTROL_TOKEN || process.env.MISSION_CONTROL_AGENT_TOKEN);
  if (!hasMCToken) {
    console.warn(`${TAG} WARN: No MC token found — MC posts will be skipped`);
  }

  // Step 1: Scrape
  console.log(`${TAG} Scraping Daily Virals trending...`);
  const scrapeResult = await scrapeTrending(cfg);

  // Handle blocking
  if (scrapeResult.blocked) {
    console.error(`${TAG} BLOCKED: ${scrapeResult.blockReason}`);

    if (hasMCToken) {
      const instructions = `1. Log into Daily Virals manually at ${process.env.DAILY_VIRALS_TRENDING_URL}
2. Complete any 2FA/CAPTCHA challenge
3. If credentials changed, update DAILY_VIRALS_EMAIL and DAILY_VIRALS_PASSWORD in web/.env.local
4. Check screenshots/blocked.png for the page state
5. Re-run: \`npm run trending:daily-virals -- --dry-run\``;

      console.log(`${TAG} Posting BLOCKED doc to MC...`);
      const blockResult = await postBlockedDoc(scrapeResult.blockReason!, instructions);
      if (blockResult.ok) {
        console.log(`${TAG} Blocked doc posted: ${blockResult.id}`);
      }
    }

    process.exit(1);
  }

  // Log warnings
  for (const w of scrapeResult.warnings) {
    console.warn(`${TAG} WARN: ${w}`);
  }

  if (scrapeResult.items.length === 0) {
    console.error(`${TAG} No items extracted — check selectors or page structure`);
    console.error(`${TAG} Warnings: ${scrapeResult.warnings.join('; ')}`);
    process.exit(1);
  }

  console.log(`${TAG} Extracted ${scrapeResult.items.length} items, ${scrapeResult.screenshotPaths.length} screenshots`);

  // Step 2: Export locally (always, even in dry-run)
  console.log(`${TAG} Exporting data...`);
  const exportResult = exportTrending(scrapeResult.items, cfg.date);
  console.log(`${TAG} Exported ${exportResult.files.length} files to ${exportResult.dir}`);

  if (cfg.dryRun) {
    console.log(`\n${TAG} === DRY RUN PREVIEW ===`);
    for (const item of scrapeResult.items) {
      const metricStr = Object.entries(item.metrics)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      console.log(`  ${item.rank}. ${item.title} [${item.category || 'uncategorized'}] ${metricStr || '(no metrics)'}`);
    }
    console.log(`\n${TAG} DRY RUN — skipping MC post`);
    console.log(`${TAG} latest.json: ${exportResult.files[0]}`);
    process.exit(0);
  }

  // Step 3: Post to MC
  if (!hasMCToken) {
    console.warn(`${TAG} No MC token — skipping MC post`);
  } else {
    console.log(`${TAG} Posting trending doc to Mission Control...`);
    const mcContent = buildMCDoc(scrapeResult.items, cfg.date);
    const mcResult = await postToMC({
      title: `Daily Virals Trending — ${cfg.date}`,
      content: mcContent,
      category: 'drafts',
      lane: 'FlashFlow',
      tags: ['trending', 'daily-virals', cfg.date],
    });

    if (mcResult.ok) {
      console.log(`${TAG} MC doc posted: ${mcResult.id}`);
    } else {
      console.error(`${TAG} MC post failed: ${mcResult.error}`);
    }
  }

  // Summary
  console.log(`\n${TAG} === Summary ===`);
  console.log(`${TAG} Items: ${scrapeResult.items.length}`);
  console.log(`${TAG} Screenshots: ${scrapeResult.screenshotPaths.length}`);
  console.log(`${TAG} Warnings: ${scrapeResult.warnings.length}`);
  console.log(`${TAG} Errors: ${scrapeResult.errors.length}`);
  console.log(`${TAG} latest.json: ${exportResult.files[0]}`);
  console.log(`${TAG} latest.csv: ${exportResult.files[2]}`);
}

main().catch((err) => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(1);
});
