/**
 * Daily Virals Playwright scraper.
 *
 * Uses a pre-saved storageState (from bootstrap-session.ts) to skip login.
 * Navigates to the trending page, extracts top N items, takes screenshots.
 *
 * If no session exists or Cloudflare blocks, returns blocked=true with
 * instructions to run the bootstrap script.
 */

import { chromium, type Browser, type Page, type ElementHandle } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { COOKIE_BANNER, TRENDING, PAGINATION } from './selectors';
import type { TrendingItem, TrendingMetrics, ScrapeResult, RunConfig } from './types';

const TAG = '[daily-virals:scraper]';

// ── session management ──

const SESSION_PATH = path.join(process.cwd(), 'data/sessions/daily-virals.storageState.json');
const META_PATH = path.join(process.cwd(), 'data/sessions/daily-virals.meta.json');
const SESSION_MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours

function getSessionState(): { path: string; ageMin: number } | null {
  try {
    if (!fs.existsSync(SESSION_PATH)) return null;

    // Prefer saved_at from meta file; fall back to file mtime
    let ageMs: number;
    try {
      const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf-8'));
      ageMs = Date.now() - new Date(meta.saved_at).getTime();
    } catch {
      const stat = fs.statSync(SESSION_PATH);
      ageMs = Date.now() - stat.mtimeMs;
    }

    if (ageMs > SESSION_MAX_AGE_MS) {
      console.log(`${TAG} Session expired (age: ${Math.round(ageMs / 3600000)}h, max: 72h)`);
      return null;
    }
    return { path: SESSION_PATH, ageMin: Math.round(ageMs / 60000) };
  } catch { return null; }
}

// ── helpers ──

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function trySelector(page: Page | ElementHandle, selectors: readonly string[]): Promise<ElementHandle | null> {
  for (const sel of selectors) {
    try {
      const el = await (page as Page).$(sel);
      if (el) return el;
    } catch { /* selector not found, try next */ }
  }
  return null;
}

async function dismissCookieBanner(page: Page): Promise<void> {
  for (const sel of COOKIE_BANNER.acceptButton) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        console.log(`${TAG} Cookie banner dismissed`);
        await page.waitForTimeout(1000);
        return;
      }
    } catch { /* next */ }
  }
}

// ── item extraction ──

async function extractItem(
  container: ElementHandle,
  index: number,
  _page: Page,
): Promise<TrendingItem | null> {
  try {
    const rank = index + 1;
    const title = await tryTextFromEl(container, TRENDING.title) || `Item ${rank}`;
    const productName = await tryTextFromEl(container, TRENDING.productName) || title;
    const category = await tryTextFromEl(container, TRENDING.category) || '';
    const hookText = await tryTextFromEl(container, TRENDING.hookText) || '';
    const scriptSnippet = await tryTextFromEl(container, TRENDING.scriptSnippet) || '';

    // Thumbnail
    let thumbnailUrl = '';
    for (const sel of TRENDING.thumbnail) {
      try {
        const el = await container.$(sel);
        if (el) {
          thumbnailUrl = await el.getAttribute('src') || await el.getAttribute('poster') || '';
          if (thumbnailUrl) break;
        }
      } catch { /* next */ }
    }

    // Source link
    let sourceUrl = '';
    for (const sel of TRENDING.sourceLink) {
      try {
        const el = await container.$(sel);
        if (el) {
          sourceUrl = await el.getAttribute('href') || '';
          if (sourceUrl) break;
        }
      } catch { /* next */ }
    }

    // Metrics
    const metrics: TrendingMetrics = {};
    for (const sel of TRENDING.metricSelectors) {
      try {
        const els = await container.$$(sel);
        for (const el of els) {
          const text = ((await el.textContent()) ?? '').trim();
          if (!text || text.length > 200) continue;

          const className = (await el.getAttribute('class')) ?? '';
          const lc = className.toLowerCase() + ' ' + text.toLowerCase();

          if (lc.includes('view')) metrics.views = text;
          else if (lc.includes('gmv') || lc.includes('gross')) metrics.gmv = text;
          else if (lc.includes('velocity') || lc.includes('speed')) metrics.velocity = text;
          else if (lc.includes('sold') || lc.includes('unit')) metrics.units_sold = text;
          else if (lc.includes('revenue') || lc.includes('rev')) metrics.revenue = text;
          else if (lc.includes('commission') || lc.includes('rate')) metrics.commission_rate = text;
          else if (lc.includes('like')) metrics.likes = text;
          else if (lc.includes('share')) metrics.shares = text;
        }
      } catch { /* next selector */ }
    }

    return {
      rank,
      title,
      product_name: productName,
      category,
      metrics,
      hook_text: hookText,
      script_snippet: scriptSnippet,
      source_url: sourceUrl,
      thumbnail_url: thumbnailUrl,
      ai_observation: '',
      captured_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`${TAG} Failed to extract item ${index + 1}:`, err);
    return null;
  }
}

async function tryTextFromEl(container: ElementHandle, selectors: readonly string[]): Promise<string> {
  for (const sel of selectors) {
    try {
      const el = await container.$(sel);
      if (el) {
        const text = await el.textContent();
        if (text?.trim()) return text.trim();
      }
    } catch { /* next */ }
  }
  return '';
}

// ── screenshots ──

async function takeItemScreenshot(
  container: ElementHandle,
  rank: number,
  title: string,
  screenshotDir: string,
): Promise<string> {
  const filename = `${String(rank).padStart(2, '0')}-${slug(title)}.png`;
  const filepath = path.join(screenshotDir, filename);

  try {
    await container.screenshot({ path: filepath });
    return filepath;
  } catch (err) {
    console.warn(`${TAG} Screenshot failed for rank ${rank}: ${err}`);
    return '';
  }
}

// ── data validation ──

const JUNK_PATTERNS = [
  /cookie/i,
  /we use cookies/i,
  /accept all/i,
  /privacy policy/i,
  /terms of service/i,
  /sign up/i,
  /create.*account/i,
  /subscribe.*newsletter/i,
  /loading\.\.\./i,
  /please wait/i,
];

function isJunkItem(item: TrendingItem): boolean {
  if (/^Item \d+$/.test(item.title)) return true;

  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(item.hook_text)) return true;
    if (pattern.test(item.title)) return true;
    if (pattern.test(item.product_name)) return true;
  }

  const hasTitle = item.title.length > 2 && !/^Item \d+$/.test(item.title);
  const hasMetrics = Object.values(item.metrics).some(v => v);
  const hasHook = item.hook_text.length > 5;
  const hasUrl = item.source_url.length > 0;

  if (!hasTitle && !hasMetrics && !hasHook && !hasUrl) return true;

  return false;
}

function validateAndClean(items: TrendingItem[]): { valid: TrendingItem[]; rejected: number } {
  const valid: TrendingItem[] = [];
  let rejected = 0;

  for (const item of items) {
    if (isJunkItem(item)) {
      console.warn(`${TAG} Rejected junk item: rank=${item.rank} title="${item.title}" hook="${item.hook_text.slice(0, 60)}"`);
      rejected++;
      continue;
    }
    valid.push({ ...item, rank: valid.length + 1 });
  }

  return { valid, rejected };
}

// ── main scrape function ──

export async function scrapeTrending(config: RunConfig): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    items: [],
    screenshotPaths: [],
    warnings: [],
    errors: [],
    blocked: false,
  };

  const trendingUrl = process.env.DAILY_VIRALS_TRENDING_URL;
  if (!trendingUrl) {
    result.blocked = true;
    result.blockReason = 'DAILY_VIRALS_TRENDING_URL not set in env';
    return result;
  }

  // Require a valid session — never attempt automated login
  const session = getSessionState();
  if (!session) {
    result.blocked = true;
    result.blockReason = `No valid session found. Run: npm run trending:daily-virals:bootstrap`;
    return result;
  }
  console.log(`${TAG} Using saved session (age: ${session.ageMin}m)`);

  const screenshotDir = path.join(
    process.cwd(),
    'data/trending/daily-virals/screenshots',
    config.date,
  );

  if (!config.skipScreenshots) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  let browser: Browser | null = null;

  try {
    console.log(`${TAG} Launching browser...`);
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      storageState: session.path,
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const page = await context.newPage();

    // Navigate directly to trending page with saved session
    console.log(`${TAG} Navigating to trending page: ${trendingUrl}`);
    const response = await page.goto(trendingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Check for Cloudflare block
    const status = response?.status() ?? 0;
    if (status === 403) {
      result.blocked = true;
      result.blockReason = `Cloudflare blocked (HTTP 403). Session may be invalid. Run: npm run trending:daily-virals:bootstrap`;
      const ssDir = path.join(process.cwd(), 'data/trending/daily-virals/screenshots');
      fs.mkdirSync(ssDir, { recursive: true });
      await page.screenshot({ path: path.join(ssDir, 'blocked-403.png'), fullPage: true });
      return result;
    }

    // Wait for Cloudflare challenge to resolve (if present)
    await page.waitForTimeout(7000);

    // Check page title for Cloudflare challenge page
    const title = await page.title();
    if (title.includes('Cloudflare') || title.includes('Attention Required')) {
      result.blocked = true;
      result.blockReason = `Cloudflare challenge detected ("${title}"). Run: npm run trending:daily-virals:bootstrap`;
      return result;
    }

    // Dismiss cookie banner
    await dismissCookieBanner(page);

    // Wait for content to load
    console.log(`${TAG} Waiting for content to load...`);
    let contentFound = false;
    for (const sel of TRENDING.contentLoadedIndicator) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        console.log(`${TAG} Content loaded (found: ${sel})`);
        contentFound = true;
        break;
      } catch { /* try next */ }
    }
    if (!contentFound) {
      console.log(`${TAG} No content indicator found yet — waiting 10s more...`);
      await page.waitForTimeout(10000);
    }
    await page.waitForTimeout(3000);

    // Dump page HTML for selector debugging
    const debugHtml = await page.content();
    fs.mkdirSync(screenshotDir, { recursive: true });
    const htmlDebugPath = path.join(screenshotDir, 'debug-page.html');
    fs.writeFileSync(htmlDebugPath, debugHtml);
    console.log(`${TAG} Page HTML dumped to ${htmlDebugPath} (${debugHtml.length} chars)`);

    // Full-page screenshot
    if (!config.skipScreenshots) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      const fullPagePath = path.join(screenshotDir, '00-full-page.png');
      await page.screenshot({ path: fullPagePath, fullPage: true });
      result.screenshotPaths.push(fullPagePath);
      console.log(`${TAG} Full page screenshot saved`);
    }

    // Find trending item containers
    console.log(`${TAG} Extracting trending items (max: ${config.maxItems})...`);

    let containers: ElementHandle[] = [];
    for (const sel of TRENDING.itemContainer) {
      try {
        containers = await page.$$(sel);
        if (containers.length > 0) {
          console.log(`${TAG} Found ${containers.length} items using selector: ${sel}`);
          break;
        }
      } catch { /* try next selector */ }
    }

    if (containers.length === 0) {
      // Try loading more items
      for (const sel of PAGINATION.loadMore) {
        try {
          const btn = await page.$(sel);
          if (btn) {
            await btn.click();
            await page.waitForTimeout(3000);
            break;
          }
        } catch { /* next */ }
      }

      // Retry finding containers
      for (const sel of TRENDING.itemContainer) {
        try {
          containers = await page.$$(sel);
          if (containers.length > 0) break;
        } catch { /* next */ }
      }
    }

    if (containers.length === 0) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      const emptyScreenshot = path.join(screenshotDir, '00-no-items.png');
      await page.screenshot({ path: emptyScreenshot, fullPage: true }).catch(() => {});
      result.warnings.push(`No trending items found. HTML dumped to ${htmlDebugPath}`);
      console.warn(`${TAG} No trending items found — HTML dumped for debugging`);
      return result;
    }

    // Extract items
    const limit = Math.min(containers.length, config.maxItems);
    for (let i = 0; i < limit; i++) {
      const item = await extractItem(containers[i], i, page);
      if (item) {
        result.items.push(item);

        if (!config.skipScreenshots) {
          const ssPath = await takeItemScreenshot(containers[i], item.rank, item.title, screenshotDir);
          if (ssPath) result.screenshotPaths.push(ssPath);
        }
      }
    }

    console.log(`${TAG} Extracted ${result.items.length} items`);

    // Pagination if needed
    if (result.items.length < config.maxItems && containers.length <= result.items.length) {
      for (const sel of PAGINATION.nextButton) {
        try {
          const nextBtn = await page.$(sel);
          if (nextBtn) {
            console.log(`${TAG} Loading next page...`);
            await nextBtn.click();
            await page.waitForTimeout(3000);

            for (const containerSel of TRENDING.itemContainer) {
              const newContainers = await page.$$(containerSel);
              if (newContainers.length > 0) {
                const remaining = config.maxItems - result.items.length;
                const extraLimit = Math.min(newContainers.length, remaining);
                for (let i = 0; i < extraLimit; i++) {
                  const item = await extractItem(newContainers[i], result.items.length + i, page);
                  if (item) {
                    item.rank = result.items.length + 1;
                    result.items.push(item);
                    if (!config.skipScreenshots) {
                      const ssPath = await takeItemScreenshot(newContainers[i], item.rank, item.title, screenshotDir);
                      if (ssPath) result.screenshotPaths.push(ssPath);
                    }
                  }
                }
                break;
              }
            }
            break;
          }
        } catch { /* next selector */ }
      }
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    console.error(`${TAG} Scrape error: ${msg}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log(`${TAG} Browser closed`);
    }
  }

  // Validate and clean scraped items
  if (result.items.length > 0) {
    const { valid, rejected } = validateAndClean(result.items);
    if (rejected > 0) {
      console.warn(`${TAG} Filtered out ${rejected} junk item(s), ${valid.length} valid remaining`);
      result.warnings.push(`Filtered ${rejected} junk items`);
    }
    result.items = valid;
  }

  return result;
}
