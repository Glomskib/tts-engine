#!/usr/bin/env tsx
/**
 * Bootstrap session — opens a headed browser so you can log in manually,
 * then saves the Playwright storageState for the automated scraper.
 *
 * Usage:
 *   npm run trending:daily-virals:bootstrap
 *
 * This avoids Cloudflare Turnstile by never automating login.
 * The saved session is reused for up to 72 hours.
 *
 * The script auto-detects when login completes (AuthModal disappears)
 * and saves the session automatically. It also accepts Enter as a
 * manual trigger. Times out after 5 minutes.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const TAG = '[daily-virals:bootstrap]';
const SESSION_DIR = path.join(process.cwd(), 'data/sessions');
const SESSION_PATH = path.join(SESSION_DIR, 'daily-virals.storageState.json');
const META_PATH = path.join(SESSION_DIR, 'daily-virals.meta.json');
const URL = process.env.DAILY_VIRALS_LOGIN_URL || process.env.DAILY_VIRALS_TRENDING_URL || 'https://www.thedailyvirals.com';

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Selectors that prove the user is NOT logged in. */
const NOT_LOGGED_IN_SELECTORS = [
  '#AuthModal',                           // login/signup modal overlay
  '[class*="AuthModal"]',
  'div[class*="fixed"] input[type="password"]', // password field in a modal
];

/** Selectors that prove the user IS logged in. */
const LOGGED_IN_SELECTORS = [
  'button:has-text("Logout")',
  'button:has-text("Log out")',
  'a:has-text("Logout")',
  '[class*="avatar"]',
  '[class*="user-menu"]',
  'a[href*="/account"]',
  'a[href*="/profile"]',
  'a[href*="/settings"]',
];

async function isLoggedIn(page: import('playwright').Page): Promise<{ loggedIn: boolean; reason: string }> {
  // Check for auth modal (strong "NOT logged in" signal)
  for (const sel of NOT_LOGGED_IN_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (el) {
        // Make sure it's actually visible (not display:none)
        const visible = await el.isVisible().catch(() => false);
        if (visible) {
          return { loggedIn: false, reason: `Auth modal visible: ${sel}` };
        }
      }
    } catch { /* next */ }
  }

  // Check for positive logged-in indicators
  for (const sel of LOGGED_IN_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (el) {
        return { loggedIn: true, reason: `Found logged-in indicator: ${sel}` };
      }
    } catch { /* next */ }
  }

  // No auth modal AND no explicit logged-in indicator — check page content
  // If there's no password input visible and no "Login" button outside nav, likely logged in
  const hasLoginBtn = await page.$('button:has-text("Login")').catch(() => null);
  if (!hasLoginBtn) {
    return { loggedIn: true, reason: 'No Login button or AuthModal found' };
  }

  return { loggedIn: false, reason: 'Login button still present' };
}

async function main() {
  console.log(`${TAG} Launching headed browser...`);
  console.log(`${TAG} URL: ${URL}`);
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (err) {
    console.error(`${TAG} Failed to load page:`, err);
    console.log(`${TAG} The browser is still open — complete any Cloudflare challenge manually.`);
  }

  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Log in manually in the browser window.              ║');
  console.log('║  Complete any Cloudflare / Turnstile challenge.      ║');
  console.log('║                                                      ║');
  console.log('║  The session will be saved automatically when login  ║');
  console.log('║  is detected, or press ENTER to force-save.         ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  // Race: auto-detect login via polling OR manual Enter OR timeout
  const loginDetected = await new Promise<'auto' | 'manual' | 'timeout'>((resolve) => {
    let resolved = false;
    const done = (result: 'auto' | 'manual' | 'timeout') => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    // Polling: check login state every few seconds
    const pollTimer = setInterval(async () => {
      try {
        const { loggedIn, reason } = await isLoggedIn(page);
        if (loggedIn) {
          console.log(`${TAG} Auto-detected login: ${reason}`);
          done('auto');
        } else {
          process.stdout.write(`${TAG} Waiting for login... (${reason})\r`);
        }
      } catch { /* page might be navigating */ }
    }, POLL_INTERVAL_MS);

    // Manual: listen for Enter on stdin (non-blocking)
    if (process.stdin.isTTY) {
      process.stdin.setRawMode?.(false);
    }
    process.stdin.resume();
    process.stdin.once('data', () => {
      console.log(`${TAG} Manual Enter received`);
      done('manual');
    });

    // Timeout
    const timeoutTimer = setTimeout(() => {
      console.warn(`${TAG} Timed out after ${TIMEOUT_MS / 60000}min`);
      done('timeout');
    }, TIMEOUT_MS);

    // Cleanup on resolve
    const origResolve = resolve;
    resolve = (val) => {
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      process.stdin.pause();
      origResolve(val);
    };
  });

  console.log('');

  // Verify login state
  console.log(`${TAG} Verifying login state...`);
  const { loggedIn, reason } = await isLoggedIn(page);

  if (loggedIn) {
    console.log(`${TAG} ✓ Logged in: ${reason}`);
  } else if (loginDetected === 'timeout') {
    console.error(`${TAG} ✗ Timed out and NOT logged in: ${reason}`);
    console.error(`${TAG}   Re-run: npm run trending:daily-virals:bootstrap`);
    await browser.close();
    process.exit(1);
  } else {
    // Manual Enter but auth modal still visible — warn loudly
    console.warn(`${TAG} ⚠ Login NOT confirmed: ${reason}`);
    console.warn(`${TAG}   Saving session anyway — scraper may fail. Re-run bootstrap if needed.`);
  }

  // Save storageState + meta file
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const state = await context.storageState();
  fs.writeFileSync(SESSION_PATH, JSON.stringify(state));

  const now = new Date();
  const meta = { saved_at: now.toISOString(), url: page.url(), verified: loggedIn };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));

  console.log('');
  console.log(`${TAG} ✓ Session saved: ${SESSION_PATH}`);
  console.log(`${TAG} ✓ Meta saved: ${META_PATH}`);
  console.log(`${TAG}   Timestamp: ${now.toISOString()}`);
  console.log(`${TAG}   Expires: ~${new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()}`);
  console.log(`${TAG}   Current URL: ${page.url()}`);
  console.log(`${TAG}   Verified: ${loggedIn}`);
  console.log('');
  console.log(`${TAG} You can now run the scraper:`);
  console.log(`${TAG}   npm run trending:daily-virals`);

  await browser.close();
}

main().catch(err => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
