#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * Revenue Intelligence – Bootstrap TikTok Session
 *
 * Opens a headed browser with a persistent profile so the user can
 * log into TikTok manually. The session persists across future
 * headless ingestion runs.
 *
 * Usage:
 *   pnpm run ri:bootstrap -- --username <tiktok_username>
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { chromium, type Page, type BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const TAG = '[ri:bootstrap]';

const PROFILE_BASE = path.join(
  process.env.HOME ?? process.cwd(),
  '.openclaw',
  'browser-profiles',
);

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 5 * 60_000;

const NOT_LOGGED_IN = [
  '[data-e2e="top-login-button"]',
  'button:has-text("Log in")',
  'button:has-text("Sign up")',
  'input[name="username"]',
];

const LOGGED_IN_INDICATORS = [
  // Must use indicators that only appear when authenticated —
  // video grid is public and visible without login
  '[data-e2e="inbox-icon"]',
  '[data-e2e="profile-icon"]',
  '[class*="DivAvatarContainer"] img',
  'a[href*="/inbox"]',
  '[data-e2e="nav-upload"]',
];

function getUsername(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--username');
  if (idx === -1 || idx + 1 >= args.length) {
    console.error(`${TAG} Usage: pnpm run ri:bootstrap -- --username <tiktok_username>`);
    process.exit(1);
  }
  return args[idx + 1].replace(/^@/, '');
}

async function isLoggedIn(page: Page): Promise<{ loggedIn: boolean; reason: string }> {
  const url = page.url();
  if (url.includes('/login') || url.includes('/auth')) {
    return { loggedIn: false, reason: 'URL contains login path' };
  }

  for (const sel of NOT_LOGGED_IN) {
    try {
      const visible = await page.locator(sel).first().isVisible({ timeout: 2_000 });
      if (visible) return { loggedIn: false, reason: `Not-logged-in indicator: ${sel}` };
    } catch { /* next */ }
  }

  for (const sel of LOGGED_IN_INDICATORS) {
    try {
      const el = await page.$(sel);
      if (el) return { loggedIn: true, reason: `Found: ${sel}` };
    } catch { /* next */ }
  }

  return { loggedIn: true, reason: 'No login indicators found' };
}

async function main() {
  const username = getUsername();
  const profileDir = path.join(PROFILE_BASE, `ri-tiktok-${username}`);
  const profileUrl = `https://www.tiktok.com/@${username}`;

  console.log(`${TAG} Bootstrapping session for @${username}`);
  console.log(`${TAG} Profile: ${profileDir}`);
  console.log(`${TAG} URL:     ${profileUrl}`);
  console.log('');

  fs.mkdirSync(profileDir, { recursive: true });

  // Clean stale lock files
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { fs.unlinkSync(path.join(profileDir, lock)); } catch { /* ok */ }
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    userAgent: USER_AGENT,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (err: any) {
    console.error(`${TAG} Page load issue: ${err.message}`);
    console.log(`${TAG} Browser is still open — complete any challenge manually.`);
  }

  await page.waitForTimeout(3_000);

  const initial = await isLoggedIn(page);
  if (initial.loggedIn) {
    console.log(`${TAG} Already logged in: ${initial.reason}`);
    console.log(`${TAG} Session saved to: ${profileDir}`);
    await context.close();
    return;
  }

  console.log('');
  console.log('='.repeat(55));
  console.log('  LOG IN TO TIKTOK in the browser window.');
  console.log('  Session auto-saves when login is detected.');
  console.log('  Press Enter to force-save, or type "quit" to abort.');
  console.log('='.repeat(55));
  console.log('');

  const result = await new Promise<'auto' | 'manual' | 'timeout'>((resolve) => {
    let resolved = false;
    const done = (r: 'auto' | 'manual' | 'timeout') => {
      if (resolved) return;
      resolved = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      process.stdin.pause();
      resolve(r);
    };

    const pollTimer = setInterval(async () => {
      try {
        const { loggedIn, reason } = await isLoggedIn(page);
        if (loggedIn) {
          console.log(`${TAG} Auto-detected login: ${reason}`);
          done('auto');
        }
      } catch { /* page navigating */ }
    }, POLL_INTERVAL_MS);

    const timeoutTimer = setTimeout(() => {
      console.warn(`${TAG} Timed out after ${MAX_WAIT_MS / 60_000} minutes`);
      done('timeout');
    }, MAX_WAIT_MS);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode?.(false);
    }
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      const text = data.toString().trim().toLowerCase();
      if (text === 'quit') done('timeout');
      else done('manual');
    });
  });

  if (result === 'timeout') {
    console.error(`${TAG} Aborted — no login detected.`);
    await context.close();
    process.exit(1);
  }

  const final = await isLoggedIn(page);
  console.log(`${TAG} Login ${final.loggedIn ? 'confirmed' : 'NOT confirmed'}: ${final.reason}`);
  console.log(`${TAG} Session saved to: ${profileDir}`);
  console.log(`${TAG} Next ingestion run will reuse this session.`);

  await context.close();
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err.message);
  process.exit(1);
});
