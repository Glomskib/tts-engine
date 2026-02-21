/**
 * Daily Virals Playwright scraper.
 *
 * Logs in, navigates to trending page, extracts top N items,
 * takes screenshots per item, and returns a normalized dataset.
 *
 * If login fails due to 2FA/CAPTCHA, returns blocked=true with reason.
 */

import { chromium, type Browser, type Page, type ElementHandle } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { LOGIN, TRENDING, PAGINATION } from './selectors';
import type { TrendingItem, TrendingMetrics, ScrapeResult, RunConfig } from './types';

const TAG = '[daily-virals:scraper]';

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

async function tryText(page: Page | ElementHandle, selectors: readonly string[]): Promise<string> {
  const el = await trySelector(page, selectors);
  if (!el) return '';
  const text = await el.textContent();
  return (text ?? '').trim();
}

async function trySrc(page: Page | ElementHandle, selectors: readonly string[]): Promise<string> {
  for (const sel of selectors) {
    try {
      const el = await (page as Page).$(sel);
      if (!el) continue;
      const src = await el.getAttribute('src') || await el.getAttribute('poster') || '';
      if (src) return src;
    } catch { /* next */ }
  }
  return '';
}

async function tryHref(page: Page | ElementHandle, selectors: readonly string[]): Promise<string> {
  for (const sel of selectors) {
    try {
      const el = await (page as Page).$(sel);
      if (!el) continue;
      const href = await el.getAttribute('href') || '';
      if (href) return href;
    } catch { /* next */ }
  }
  return '';
}

// ── login ──

async function login(page: Page): Promise<{ ok: boolean; blocked: boolean; reason?: string }> {
  const email = process.env.DAILY_VIRALS_EMAIL;
  const password = process.env.DAILY_VIRALS_PASSWORD;
  const loginUrl = process.env.DAILY_VIRALS_LOGIN_URL || process.env.DAILY_VIRALS_TRENDING_URL || '';

  if (!email || !password) {
    return { ok: false, blocked: true, reason: 'DAILY_VIRALS_EMAIL or DAILY_VIRALS_PASSWORD not set in env' };
  }

  console.log(`${TAG} Navigating to login page...`);

  // If DAILY_VIRALS_TRENDING_URL contains a login redirect, go directly
  // Otherwise navigate to the trending URL and expect a login redirect
  const trendingUrl = process.env.DAILY_VIRALS_TRENDING_URL || '';
  await page.goto(trendingUrl || loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for Cloudflare challenge to resolve (if present)
  await page.waitForTimeout(5000);

  // Wait for page to settle
  await page.waitForTimeout(2000);

  // Check if already logged in
  for (const indicator of LOGIN.loggedInIndicator) {
    try {
      const el = await page.$(indicator);
      if (el) {
        console.log(`${TAG} Already logged in (found: ${indicator})`);
        return { ok: true, blocked: false };
      }
    } catch { /* continue */ }
  }

  // Look for login form
  const emailInput = await page.$(LOGIN.emailInput);
  if (!emailInput) {
    // Maybe the page needs to load more, wait and retry
    await page.waitForTimeout(3000);
    const retryEmail = await page.$(LOGIN.emailInput);
    if (!retryEmail) {
      console.log(`${TAG} No login form found — page might already be authenticated or URL is wrong`);
      // Check if we're on the trending page anyway
      const pageContent = await page.content();
      if (pageContent.length > 5000) {
        return { ok: true, blocked: false };
      }
      return { ok: false, blocked: true, reason: 'Login form not found. Check DAILY_VIRALS_TRENDING_URL.' };
    }
  }

  // Fill login form
  console.log(`${TAG} Filling login form...`);
  await page.fill(LOGIN.emailInput, email);
  await page.fill(LOGIN.passwordInput, password);
  await page.click(LOGIN.submitButton);

  // Wait for navigation or block indicator
  await page.waitForTimeout(5000);

  // Check for 2FA / CAPTCHA blockers
  for (const blocker of LOGIN.blockIndicators) {
    try {
      const el = await page.$(blocker);
      if (el) {
        const screenshotPath = path.join(process.cwd(), 'data/trending/daily-virals/screenshots/blocked.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        return {
          ok: false,
          blocked: true,
          reason: `Login blocked by 2FA/CAPTCHA (detected: ${blocker}). Screenshot saved to ${screenshotPath}. Manual intervention required.`,
        };
      }
    } catch { /* continue */ }
  }

  // Check if login succeeded
  for (const indicator of LOGIN.loggedInIndicator) {
    try {
      const el = await page.$(indicator);
      if (el) {
        console.log(`${TAG} Login successful`);
        return { ok: true, blocked: false };
      }
    } catch { /* continue */ }
  }

  // If we're on a different URL from login, assume success
  const currentUrl = page.url();
  if (currentUrl !== trendingUrl && !currentUrl.includes('login') && !currentUrl.includes('signin')) {
    console.log(`${TAG} Login appears successful (redirected to: ${currentUrl})`);
    return { ok: true, blocked: false };
  }

  // Last resort: check page content length (authenticated pages are larger)
  const content = await page.content();
  if (content.length > 10000) {
    console.log(`${TAG} Login appears successful (page content: ${content.length} chars)`);
    return { ok: true, blocked: false };
  }

  return { ok: false, blocked: true, reason: 'Login did not succeed — no logged-in indicator found and no block detected. Check credentials.' };
}

// ── item extraction ──

async function extractItem(
  container: ElementHandle,
  index: number,
  page: Page,
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

    // Metrics — collect all metric-like text from known selectors
    const metrics: TrendingMetrics = {};
    for (const sel of TRENDING.metricSelectors) {
      try {
        const els = await container.$$(sel);
        for (const el of els) {
          const text = ((await el.textContent()) ?? '').trim();
          if (!text || text.length > 200) continue;

          // Try to infer metric type from class/aria/text
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

    // AI observation — generated later, placeholder
    const aiObservation = '';

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
      ai_observation: aiObservation,
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
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    // Remove webdriver flag to avoid Cloudflare bot detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const page = await context.newPage();

    // Step 1: Login
    const loginResult = await login(page);
    if (!loginResult.ok) {
      result.blocked = loginResult.blocked;
      result.blockReason = loginResult.reason;
      return result;
    }

    // Step 2: Navigate to trending page (if not already there)
    const currentUrl = page.url();
    if (!currentUrl.includes(new URL(trendingUrl).pathname)) {
      console.log(`${TAG} Navigating to trending page: ${trendingUrl}`);
      await page.goto(trendingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(5000);
    }

    // Take a full-page screenshot for reference
    if (!config.skipScreenshots) {
      const fullPagePath = path.join(screenshotDir, '00-full-page.png');
      await page.screenshot({ path: fullPagePath, fullPage: true });
      result.screenshotPaths.push(fullPagePath);
      console.log(`${TAG} Full page screenshot saved`);
    }

    // Step 3: Find trending item containers
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
      // Fallback: dump page content for debugging
      const html = await page.content();
      const debugPath = path.join(screenshotDir, 'debug-page.html');
      fs.writeFileSync(debugPath, html);
      result.warnings.push(`No trending items found. Page HTML dumped to ${debugPath}`);
      console.warn(`${TAG} No trending items found — HTML dumped for debugging`);
      return result;
    }

    // Step 4: Extract items
    const limit = Math.min(containers.length, config.maxItems);
    for (let i = 0; i < limit; i++) {
      const item = await extractItem(containers[i], i, page);
      if (item) {
        result.items.push(item);

        // Screenshot per item
        if (!config.skipScreenshots) {
          const ssPath = await takeItemScreenshot(containers[i], item.rank, item.title, screenshotDir);
          if (ssPath) result.screenshotPaths.push(ssPath);
        }
      }
    }

    console.log(`${TAG} Extracted ${result.items.length} items`);

    // Step 5: If we need more items (pagination)
    if (result.items.length < config.maxItems && containers.length <= result.items.length) {
      for (const sel of PAGINATION.nextButton) {
        try {
          const nextBtn = await page.$(sel);
          if (nextBtn) {
            console.log(`${TAG} Loading next page...`);
            await nextBtn.click();
            await page.waitForTimeout(3000);

            // Re-extract from new page
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

  return result;
}
