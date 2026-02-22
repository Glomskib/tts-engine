#!/usr/bin/env tsx
/**
 * Daily Virals Trending — CLI runner.
 *
 * Usage:
 *   npm run trending:daily-virals
 *   npm run trending:daily-virals -- --dry-run
 *
 * Env vars required (for real mode):
 *   DAILY_VIRALS_EMAIL         Login email
 *   DAILY_VIRALS_PASSWORD      Login password
 *   DAILY_VIRALS_TRENDING_URL  URL of the trending page to scrape
 *
 * Optional:
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  → DB persistence
 *   MC_API_TOKEN                                          → Mission Control posting
 *
 * Outputs:
 *   web/data/trending/daily-virals/latest.json
 *   web/data/trending/daily-virals/YYYY-MM-DD.json
 *   web/data/trending/daily-virals/latest.csv
 *   web/data/trending/daily-virals/screenshots/YYYY-MM-DD/<rank>-<slug>.png
 *   Supabase: ff_trending_items rows (upserted)
 *   Supabase Storage: trending/<date>/daily_virals/<rank>.png
 *   web/public/trending.json (latest snapshot)
 *
 * Mock mode:
 *   If DAILY_VIRALS_EMAIL/PASSWORD/URL are missing, runs with sample data
 *   (no login, no scraping) so the rest of the pipeline can be tested.
 *
 * Graceful degradation:
 *   - Missing MC token → skip MC posts, still export locally
 *   - Missing Supabase vars → skip DB/storage, still export locally
 *   - 2FA / CAPTCHA → post BLOCKED doc to MC and stop
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import type { RunConfig, TrendingItem } from './lib/types';
import { scrapeTrending } from './lib/scraper';
import { exportTrending } from './lib/exporter';
import { postToMC, postBlockedDoc } from './lib/mc-poster';
import { upsertTrendingItems, uploadScreenshots } from './lib/db';
import { writeTrendingJson } from './lib/public-export';

const TAG = '[daily-virals]';

function parseArgs(): RunConfig & { mock: boolean } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  // Auto-detect mock mode when scraper env vars are missing
  const hasScrapeEnv = !!(
    process.env.DAILY_VIRALS_EMAIL &&
    process.env.DAILY_VIRALS_PASSWORD &&
    process.env.DAILY_VIRALS_TRENDING_URL
  );
  const mock = args.includes('--mock') || !hasScrapeEnv;

  return {
    dryRun,
    mock,
    maxItems: dryRun ? 3 : 20,
    skipScreenshots: dryRun || mock,
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
  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean)));
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

/** Generate mock data for testing the pipeline without live scraping. */
function generateMockItems(count: number): TrendingItem[] {
  const samples = [
    { name: 'LED Strip Lights', category: 'Home & Garden', hook: 'Watch this room transform in 10 seconds' },
    { name: 'Portable Blender', category: 'Kitchen', hook: 'Making smoothies anywhere just got real' },
    { name: 'Phone Grip Stand', category: 'Electronics', hook: 'The phone accessory everyone needs' },
    { name: 'Posture Corrector', category: 'Health', hook: 'My back pain disappeared in a week' },
    { name: 'Mini Projector', category: 'Electronics', hook: 'Movie theater vibes for $30' },
  ];

  return Array.from({ length: count }, (_, i) => {
    const sample = samples[i % samples.length];
    return {
      rank: i + 1,
      title: sample.name,
      product_name: sample.name,
      category: sample.category,
      metrics: { views: `${(Math.random() * 10).toFixed(1)}M`, gmv: `$${(Math.random() * 500).toFixed(0)}K` },
      hook_text: sample.hook,
      script_snippet: '',
      source_url: `https://example.com/product/${i + 1}`,
      thumbnail_url: '',
      ai_observation: '',
      captured_at: new Date().toISOString(),
    };
  });
}

/**
 * Core job function — can be called from CLI or cron route.
 * Returns a summary object for programmatic callers.
 */
export async function runDailyViralsJob(options?: {
  dryRun?: boolean;
  mock?: boolean;
  date?: string;
  creatorStyleId?: string;
}): Promise<{
  ok: boolean;
  itemCount: number;
  dbUpserted: boolean;
  mcPosted: boolean;
  error?: string;
}> {
  const cfg = options
    ? {
        dryRun: options.dryRun ?? false,
        mock: options.mock ?? false,
        maxItems: options.dryRun ? 3 : 20,
        skipScreenshots: options.dryRun || options.mock || false,
        date: options.date || new Date().toISOString().slice(0, 10),
      }
    : parseArgs();

  console.log(`${TAG} Starting at ${new Date().toISOString()}`);
  console.log(`${TAG} Date: ${cfg.date}`);
  console.log(`${TAG} Mode: ${cfg.mock ? 'MOCK (sample data)' : cfg.dryRun ? 'DRY RUN (3 items, no screenshots)' : 'FULL (20 items + screenshots)'}`);

  const hasMCToken = !!(process.env.MC_API_TOKEN || process.env.MISSION_CONTROL_TOKEN || process.env.MISSION_CONTROL_AGENT_TOKEN);
  if (!hasMCToken) {
    console.warn(`${TAG} WARN: No MC token found — MC posts will be skipped`);
  }

  let items: TrendingItem[];
  let screenshotPaths: string[] = [];

  // ── Step 1: Get items (scrape or mock) ──

  if (cfg.mock) {
    console.log(`${TAG} Using mock data (scraper env vars not set)`);
    items = generateMockItems(cfg.maxItems);
  } else {
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

      return { ok: false, itemCount: 0, dbUpserted: false, mcPosted: false, error: scrapeResult.blockReason };
    }

    // Log warnings
    for (const w of scrapeResult.warnings) {
      console.warn(`${TAG} WARN: ${w}`);
    }

    if (scrapeResult.items.length === 0) {
      const msg = 'No items extracted — check selectors or page structure';
      console.error(`${TAG} ${msg}`);
      return { ok: false, itemCount: 0, dbUpserted: false, mcPosted: false, error: msg };
    }

    items = scrapeResult.items;
    screenshotPaths = scrapeResult.screenshotPaths;
    console.log(`${TAG} Extracted ${items.length} items, ${screenshotPaths.length} screenshots`);
  }

  // ── Step 2: Export locally (always) ──

  console.log(`${TAG} Exporting data...`);
  const exportResult = exportTrending(items, cfg.date);
  console.log(`${TAG} Exported ${exportResult.files.length} files to ${exportResult.dir}`);

  if (cfg.dryRun) {
    console.log(`\n${TAG} === DRY RUN PREVIEW ===`);
    for (const item of items) {
      const metricStr = Object.entries(item.metrics)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      console.log(`  ${item.rank}. ${item.title} [${item.category || 'uncategorized'}] ${metricStr || '(no metrics)'}`);
    }
    console.log(`\n${TAG} DRY RUN — skipping DB, MC, public export`);
    return { ok: true, itemCount: items.length, dbUpserted: false, mcPosted: false };
  }

  // ── Step 3: Upload screenshots to Supabase Storage ──

  let screenshotUrlMap = new Map<number, string[]>();
  if (screenshotPaths.length > 0) {
    console.log(`${TAG} Uploading screenshots to Supabase Storage...`);
    screenshotUrlMap = await uploadScreenshots(screenshotPaths, cfg.date);
    console.log(`${TAG} Uploaded screenshots for ${screenshotUrlMap.size} items`);
  }

  // ── Step 4: Post to Mission Control (before DB so we get mc_doc_id) ──

  let mcPosted = false;
  let mcDocId: string | undefined;
  if (!hasMCToken) {
    console.warn(`${TAG} No MC token — skipping MC post`);
  } else {
    console.log(`${TAG} Posting trending doc to Mission Control...`);
    const mcContent = buildMCDoc(items, cfg.date);
    const mcResult = await postToMC({
      title: `Daily Virals Trending — ${cfg.date}`,
      content: mcContent,
      category: 'intel',
      lane: 'FlashFlow',
      tags: ['trending', 'daily-virals', cfg.date],
    });

    if (mcResult.ok) {
      console.log(`${TAG} MC doc posted: ${mcResult.id}`);
      mcPosted = true;
      mcDocId = mcResult.id;
    } else {
      console.error(`${TAG} MC post failed: ${mcResult.error}`);
    }
  }

  // ── Step 5: Upsert to database ──

  console.log(`${TAG} Upserting to ff_trending_items...`);
  const creatorStyleId = options?.creatorStyleId;
  const dbResult = await upsertTrendingItems(items, cfg.date, {
    screenshotUrlMap,
    mcDocId,
    creatorStyleId,
  });
  if (dbResult.ok) {
    console.log(`${TAG} DB upsert: ${dbResult.count} rows`);
  } else {
    console.warn(`${TAG} DB upsert failed: ${dbResult.error}`);
  }

  // ── Step 6: Write public trending.json ──

  console.log(`${TAG} Writing public/trending.json...`);
  writeTrendingJson(items, cfg.date);

  // ── Summary ──

  console.log(`\n${TAG} === Summary ===`);
  console.log(`${TAG} Items: ${items.length}`);
  console.log(`${TAG} Screenshots: ${screenshotPaths.length}`);
  console.log(`${TAG} DB upserted: ${dbResult.ok ? dbResult.count : 'FAILED'}`);
  console.log(`${TAG} MC posted: ${mcPosted}`);
  console.log(`${TAG} Mode: ${cfg.mock ? 'mock' : 'live'}`);

  return {
    ok: true,
    itemCount: items.length,
    dbUpserted: dbResult.ok,
    mcPosted,
  };
}

// ── CLI entry point ──
// Only run main() when executed directly (not imported by cron route)
const isDirectRun = process.argv[1]?.includes('daily-virals/run');
if (isDirectRun) {
  runDailyViralsJob().then(result => {
    if (!result.ok) process.exit(1);
  }).catch((err) => {
    console.error(`${TAG} Fatal error:`, err);
    process.exit(1);
  });
}
