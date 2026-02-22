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
import { COOKIE_BANNER, LOGIN, TRENDING, PAGINATION } from './selectors';
import type { TrendingItem, TrendingMetrics, ScrapeResult, RunConfig } from './types';

const TAG = '[daily-virals:scraper]';

// ── session persistence ──

const SESSION_DIR = path.join(process.cwd(), 'data/trending/daily-virals');
const SESSION_PATH = path.join(SESSION_DIR, '.session-state.json');

function loadSessionState(): string | undefined {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      const stat = fs.statSync(SESSION_PATH);
      const ageMs = Date.now() - stat.mtimeMs;
      // Session expires after 24 hours
      if (ageMs < 24 * 60 * 60 * 1000) {
        console.log(`${TAG} Loaded saved session (age: ${Math.round(ageMs / 60000)}m)`);
        return SESSION_PATH;
      }
      console.log(`${TAG} Session expired (age: ${Math.round(ageMs / 3600000)}h) — will re-login`);
    }
  } catch { /* no saved session */ }
  return undefined;
}

async function saveSessionState(page: Page): Promise<void> {
  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    const state = await page.context().storageState();
    fs.writeFileSync(SESSION_PATH, JSON.stringify(state));
    console.log(`${TAG} Session state saved to ${SESSION_PATH}`);
  } catch (err) {
    console.warn(`${TAG} Failed to save session state:`, err);
  }
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

// ── cookie banner ──

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
  console.log(`${TAG} No cookie banner found (or already dismissed)`);
}

// ── login ──

async function login(page: Page): Promise<{ ok: boolean; blocked: boolean; reason?: string }> {
  const email = process.env.DAILY_VIRALS_EMAIL;
  const password = process.env.DAILY_VIRALS_PASSWORD;

  if (!email || !password) {
    return { ok: false, blocked: true, reason: 'DAILY_VIRALS_EMAIL or DAILY_VIRALS_PASSWORD not set in env' };
  }

  const trendingUrl = process.env.DAILY_VIRALS_TRENDING_URL || '';

  // Step 1: Navigate to the site
  console.log(`${TAG} Navigating to ${trendingUrl}...`);
  await page.goto(trendingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for Cloudflare challenge to resolve (if present)
  await page.waitForTimeout(7000);

  // Step 2: Dismiss cookie banner
  await dismissCookieBanner(page);

  // Step 3: Check if already logged in (no "Login" link visible)
  let hasLoginLink = false;
  for (const sel of LOGIN.sidebarLoginLink) {
    try {
      const el = await page.$(sel);
      if (el) {
        const text = await el.textContent();
        if (text && text.trim().toLowerCase().includes('login')) {
          hasLoginLink = true;
          break;
        }
      }
    } catch { /* next */ }
  }

  if (!hasLoginLink) {
    // Might already be logged in — check for logged-in indicators
    for (const indicator of LOGIN.loggedInIndicator) {
      try {
        const el = await page.$(indicator);
        if (el) {
          console.log(`${TAG} Already logged in (found: ${indicator})`);
          return { ok: true, blocked: false };
        }
      } catch { /* next */ }
    }
    // No login link AND no logged-in indicator — might already be authenticated
    // Check if the sidebar "Login" text is gone (replaced by user info)
    const bodyText = await page.textContent('body') ?? '';
    if (!bodyText.toLowerCase().includes('login')) {
      console.log(`${TAG} No login link found — assuming already authenticated`);
      return { ok: true, blocked: false };
    }
  }

  // Step 4: Click the sidebar "Login" link to open the login form
  console.log(`${TAG} Clicking Login link in sidebar...`);
  let clickedLogin = false;
  for (const sel of LOGIN.sidebarLoginLink) {
    try {
      const el = await page.$(sel);
      if (el) {
        const text = await el.textContent();
        if (text && text.trim().toLowerCase().includes('login')) {
          await el.click();
          clickedLogin = true;
          console.log(`${TAG} Clicked login link (selector: ${sel})`);
          break;
        }
      }
    } catch { /* next */ }
  }

  if (!clickedLogin) {
    // Fallback: try navigating to /login directly
    try {
      const baseUrl = new URL(trendingUrl).origin;
      console.log(`${TAG} Fallback: navigating to ${baseUrl}/login`);
      await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {
      return { ok: false, blocked: true, reason: 'Could not find or click Login link, and /login fallback failed.' };
    }
  }

  // Wait for modal to appear
  await page.waitForTimeout(3000);

  // Step 4b: The modal is a Radix UI AuthModal. It may default to "Sign Up" tab.
  // Click the Login tab inside the modal using its Radix role="tab" attribute.
  try {
    const loginTab = await page.$('#AuthModal [role="tab"]:has-text("Login")');
    if (loginTab) {
      const state = await loginTab.getAttribute('data-state');
      if (state !== 'active') {
        console.log(`${TAG} Login tab not active — clicking it...`);
        await loginTab.click({ force: true });
        await page.waitForTimeout(2000);
      } else {
        console.log(`${TAG} Login tab already active`);
      }
    } else {
      // Fallback: try clicking second Login text on page
      const loginElements = await page.$$('text=Login');
      if (loginElements.length > 1) {
        console.log(`${TAG} Clicking Login element at index 1...`);
        await loginElements[1].click({ force: true });
        await page.waitForTimeout(2000);
      }
    }
  } catch (err) {
    console.warn(`${TAG} Login tab click attempt:`, err);
  }

  // Step 5: Look for email input scoped inside AuthModal
  const modal = '#AuthModal';
  let emailInput = await page.$(`${modal} ${LOGIN.emailInput}`) || await page.$(LOGIN.emailInput);
  if (!emailInput) {
    await page.waitForTimeout(3000);
    emailInput = await page.$(`${modal} ${LOGIN.emailInput}`) || await page.$(LOGIN.emailInput);
  }

  if (!emailInput) {
    const ssDir = path.join(process.cwd(), 'data/trending/daily-virals/screenshots');
    fs.mkdirSync(ssDir, { recursive: true });
    const debugPath = path.join(ssDir, 'login-debug.png');
    await page.screenshot({ path: debugPath, fullPage: true });
    console.log(`${TAG} Login form not found — debug screenshot: ${debugPath}`);
    return { ok: false, blocked: true, reason: `Login form not found after clicking Login. Debug screenshot saved to ${debugPath}` };
  }

  // Step 6: Fill login form — scoped to AuthModal to avoid matching sidebar/tab buttons.
  // Use click + type (character-by-character) instead of fill() to trigger React state updates.
  console.log(`${TAG} Filling login form...`);

  // Re-query inputs fresh after tab switch to avoid stale references.
  // Use evaluate() to focus + set value via JS, then dispatch React-compatible events.
  const emailSel = `${modal} input[type="email"], ${modal} input[name="email"], ${modal} input[placeholder*="Email"]`;
  const passwordSel = `${modal} input[type="password"]`;

  // Focus the email field via JS (bypasses overlay interception), then type via keyboard.
  // This triggers real keyboard events that React's controlled inputs respond to.
  const hasEmail = await page.evaluate(
    `(function() { var el = document.querySelector('#AuthModal input[type="email"], #AuthModal input[placeholder="Email"]'); if (el) { el.focus(); return true; } return false; })()`
  ) as boolean;

  if (!hasEmail) {
    const ssDir = path.join(process.cwd(), 'data/trending/daily-virals/screenshots');
    fs.mkdirSync(ssDir, { recursive: true });
    const debugPath = path.join(ssDir, 'fill-failed.png');
    await page.screenshot({ path: debugPath, fullPage: true });
    return { ok: false, blocked: true, reason: `Email input not found. Screenshot: ${debugPath}` };
  }

  await page.keyboard.type(email, { delay: 30 });
  console.log(`${TAG} Typed email via keyboard`);
  await page.waitForTimeout(300);

  // Now focus and type password
  const hasPw = await page.evaluate(
    `(function() { var el = document.querySelector('#AuthModal input[type="password"]'); if (el) { el.focus(); return true; } return false; })()`
  ) as boolean;

  if (!hasPw) {
    const ssDir = path.join(process.cwd(), 'data/trending/daily-virals/screenshots');
    fs.mkdirSync(ssDir, { recursive: true });
    const debugPath = path.join(ssDir, 'password-not-found.png');
    await page.screenshot({ path: debugPath, fullPage: true });
    return { ok: false, blocked: true, reason: `Password input not found. Screenshot: ${debugPath}` };
  }

  await page.keyboard.type(password, { delay: 30 });
  console.log(`${TAG} Typed password via keyboard`);
  await page.waitForTimeout(500);

  // Click the submit button via JavaScript to bypass overlay interception.
  const submitClicked = await page.evaluate(
    `(function() {
      var modal = document.querySelector('#AuthModal');
      if (!modal) return false;
      var btn = modal.querySelector('button[type="submit"]');
      if (btn) { btn.click(); return true; }
      var buttons = modal.querySelectorAll('button:not([role="tab"])');
      for (var i = 0; i < buttons.length; i++) {
        var text = (buttons[i].textContent || '').trim().toLowerCase();
        if (text === 'login' || text === 'log in' || text === 'sign in') {
          buttons[i].click(); return true;
        }
      }
      var form = modal.querySelector('form');
      if (form) { form.requestSubmit(); return true; }
      var pw = modal.querySelector('input[type="password"]');
      if (pw) { pw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; }
      return false;
    })()`
  ) as boolean;

  if (submitClicked) {
    console.log(`${TAG} Clicked submit button via JS`);
  } else {
    console.log(`${TAG} Could not find submit button — trying keyboard Enter`);
    await page.keyboard.press('Enter');
  }

  // Wait for login to process — watch for modal to close or page to change
  console.log(`${TAG} Waiting for login to complete...`);
  let loginComplete = false;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    // Check if modal is gone
    const modalEl = await page.$('#AuthModal');
    if (!modalEl) {
      console.log(`${TAG} AuthModal disappeared — login succeeded`);
      loginComplete = true;
      break;
    }
    // Check if sidebar Login button is gone
    const loginBtn = await page.$('button:has-text("Login")');
    if (!loginBtn) {
      console.log(`${TAG} Login button disappeared — login succeeded`);
      loginComplete = true;
      break;
    }
  }

  if (!loginComplete) {
    // Modal still visible after 15s — take debug screenshot
    const ssDir = path.join(process.cwd(), 'data/trending/daily-virals/screenshots');
    fs.mkdirSync(ssDir, { recursive: true });
    const debugPath = path.join(ssDir, 'login-not-completing.png');
    await page.screenshot({ path: debugPath, fullPage: true });
    console.log(`${TAG} Login form still visible after 15s — screenshot: ${debugPath}`);
    // Try pressing Enter one more time as last resort
    const pwField = await page.$(`${modal} input[type="password"]`);
    if (pwField) {
      console.log(`${TAG} Retrying with Enter key...`);
      await pwField.press('Enter');
      await page.waitForTimeout(5000);
    }
  }

  // Step 7: Check for 2FA / CAPTCHA blockers
  for (const blocker of LOGIN.blockIndicators) {
    try {
      const el = await page.$(blocker);
      if (el) {
        const ssDir = path.join(process.cwd(), 'data/trending/daily-virals/screenshots');
        fs.mkdirSync(ssDir, { recursive: true });
        const screenshotPath = path.join(ssDir, 'blocked.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        return {
          ok: false,
          blocked: true,
          reason: `Login blocked by 2FA/CAPTCHA (detected: ${blocker}). Screenshot saved to ${screenshotPath}. Manual intervention required.`,
        };
      }
    } catch { /* continue */ }
  }

  // Step 8: Verify login succeeded
  // Primary check: is the AuthModal gone?
  const modalAfterLogin = await page.$('#AuthModal');
  if (!modalAfterLogin) {
    console.log(`${TAG} Login successful (AuthModal dismissed)`);
    return { ok: true, blocked: false };
  }

  // Check known logged-in indicators
  for (const indicator of LOGIN.loggedInIndicator) {
    try {
      const el = await page.$(indicator);
      if (el) {
        console.log(`${TAG} Login successful (found: ${indicator})`);
        return { ok: true, blocked: false };
      }
    } catch { /* continue */ }
  }

  // Check if sidebar Login button text has changed (replaced by user info)
  const sidebarLoginBtn = await page.$('button:has-text("Login"):not(#AuthModal *)');
  if (!sidebarLoginBtn) {
    console.log(`${TAG} Login successful (sidebar Login button gone)`);
    return { ok: true, blocked: false };
  }

  // If modal is still visible, login likely failed
  const ssDir = path.join(process.cwd(), 'data/trending/daily-virals/screenshots');
  fs.mkdirSync(ssDir, { recursive: true });
  const debugPath = path.join(ssDir, 'login-failed.png');
  await page.screenshot({ path: debugPath, fullPage: true });

  // Dump the modal's HTML for debugging
  const modalHtml = await page.evaluate(
    `(function() { var m = document.getElementById('AuthModal'); return m ? m.innerHTML.slice(0, 2000) : 'no modal'; })()`
  ) as string;
  console.log(`${TAG} Modal HTML after login attempt: ${modalHtml.slice(0, 500)}`);

  return { ok: false, blocked: true, reason: `Login did not succeed — AuthModal still visible after form submission. Screenshot: ${debugPath}. Check credentials.` };
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
  // Reject items with fallback title pattern "Item N"
  if (/^Item \d+$/.test(item.title)) return true;

  // Reject if hook_text or title matches known junk patterns
  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(item.hook_text)) return true;
    if (pattern.test(item.title)) return true;
    if (pattern.test(item.product_name)) return true;
  }

  // Reject items with no meaningful data at all
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
    // Re-rank to fill gaps from rejected items
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

    // Try loading saved session state for cookie reuse
    const savedSession = loadSessionState();

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...(savedSession ? { storageState: savedSession } : {}),
    });

    // Remove webdriver flag to avoid Cloudflare bot detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const page = await context.newPage();

    // Step 1: Login (may be skipped if session is still valid)
    const loginResult = await login(page);
    if (!loginResult.ok) {
      result.blocked = loginResult.blocked;
      result.blockReason = loginResult.reason;
      return result;
    }

    // Save session after successful login for future runs
    await saveSessionState(page);

    // Step 1b: Dismiss the AuthModal if it's still visible after login
    console.log(`${TAG} Checking for lingering AuthModal...`);
    const modalStillOpen = await page.$('#AuthModal');
    if (modalStillOpen) {
      console.log(`${TAG} AuthModal still visible — dismissing...`);

      // Try 1: Click the X (close) button
      const closeBtn = await page.$('#AuthModal button:has(svg), #AuthModal [aria-label="Close"], #AuthModal button:near(:text("Sign Up"), 200)');
      if (closeBtn) {
        await closeBtn.click({ force: true });
        console.log(`${TAG} Clicked modal close button`);
        await page.waitForTimeout(1000);
      }

      // Try 2: Press Escape
      const stillOpen1 = await page.$('#AuthModal');
      if (stillOpen1) {
        await page.keyboard.press('Escape');
        console.log(`${TAG} Pressed Escape`);
        await page.waitForTimeout(1000);
      }

      // Try 3: Remove modal overlay via JavaScript
      const stillOpen2 = await page.$('#AuthModal');
      if (stillOpen2) {
        await page.evaluate(
          `(function() {
            var modal = document.getElementById('AuthModal');
            if (modal) modal.remove();
            document.querySelectorAll('[data-radix-portal], [role="dialog"]').forEach(function(el) { el.remove(); });
          })()`
        );
        console.log(`${TAG} Removed modal via JavaScript`);
        await page.waitForTimeout(500);
      }
    } else {
      console.log(`${TAG} AuthModal already dismissed`);
    }

    // Step 2: Navigate to trending page with a fresh load (ensures authenticated content)
    console.log(`${TAG} Navigating to trending page: ${trendingUrl}`);
    await page.goto(trendingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // Dismiss cookie banner again after fresh navigation
    await dismissCookieBanner(page);

    // Wait for content to load — look for any indicator that data is rendering
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
      // Wait longer — SPA may still be loading data
      console.log(`${TAG} No content indicator found yet — waiting 10s more...`);
      await page.waitForTimeout(10000);
    }
    // Extra settle time for SPAs
    await page.waitForTimeout(3000);

    // Dump page HTML for selector debugging
    const debugHtml = await page.content();
    fs.mkdirSync(screenshotDir, { recursive: true });
    const htmlDebugPath = path.join(screenshotDir, 'debug-page.html');
    fs.writeFileSync(htmlDebugPath, debugHtml);
    console.log(`${TAG} Page HTML dumped to ${htmlDebugPath} (${debugHtml.length} chars)`);

    // Take a full-page screenshot for reference (post-login)
    if (!config.skipScreenshots) {
      fs.mkdirSync(screenshotDir, { recursive: true });
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
      fs.mkdirSync(screenshotDir, { recursive: true });
      const html = await page.content();
      const debugPath = path.join(screenshotDir, 'debug-page.html');
      fs.writeFileSync(debugPath, html);
      // Also take a screenshot of the empty state
      const emptyScreenshot = path.join(screenshotDir, '00-no-items.png');
      await page.screenshot({ path: emptyScreenshot, fullPage: true }).catch(() => {});
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

  // Validate and clean scraped items — filter out cookie banners, junk, etc.
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
