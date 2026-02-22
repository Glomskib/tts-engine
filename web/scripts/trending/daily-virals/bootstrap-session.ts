#!/usr/bin/env tsx
/**
 * Bootstrap session — opens a headed browser so you can log in manually,
 * then saves the Playwright storageState for the automated scraper.
 *
 * Usage:
 *   npm run trending:daily-virals:bootstrap
 *
 * This avoids Cloudflare Turnstile by never automating login.
 * The saved session is reused for up to 24 hours.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const TAG = '[daily-virals:bootstrap]';
const SESSION_DIR = path.join(process.cwd(), 'data/sessions');
const SESSION_PATH = path.join(SESSION_DIR, 'daily-virals.storageState.json');
const META_PATH = path.join(SESSION_DIR, 'daily-virals.meta.json');
const URL = process.env.DAILY_VIRALS_LOGIN_URL || process.env.DAILY_VIRALS_TRENDING_URL || 'https://www.thedailyvirals.com';

/** Selectors that indicate the user is logged in. */
const LOGGED_IN_SELECTORS = [
  'button:has-text("Logout")',
  'button:has-text("Log out")',
  'a:has-text("Logout")',
  '[class*="avatar"]',
  '[class*="user-menu"]',
  'a[href*="/account"]',
  'a[href*="/profile"]',
];

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

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Log in manually in the browser window.         ║');
  console.log('║  Complete any Cloudflare / Turnstile challenge.  ║');
  console.log('║  Once you see the trending page, come back here. ║');
  console.log('║                                                  ║');
  console.log('║  Press ENTER in this terminal when done.         ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>(resolve => rl.question('  → Press ENTER after logging in... ', () => resolve()));
  rl.close();

  // Verify logged-in state
  console.log(`${TAG} Verifying login state...`);
  let verified = false;

  // Check if sidebar "Login" button is gone (replaced by user info)
  const loginBtn = await page.$('button:has-text("Login"):not(#AuthModal *)');
  if (!loginBtn) {
    console.log(`${TAG} ✓ Sidebar Login button is gone — appears logged in`);
    verified = true;
  }

  // Also check explicit logged-in indicators
  if (!verified) {
    for (const sel of LOGGED_IN_SELECTORS) {
      try {
        const el = await page.$(sel);
        if (el) {
          console.log(`${TAG} ✓ Found logged-in indicator: ${sel}`);
          verified = true;
          break;
        }
      } catch { /* next */ }
    }
  }

  // Check body text doesn't contain "Login" in prominent places
  if (!verified) {
    const bodyText = await page.textContent('body') ?? '';
    if (!bodyText.includes('Login')) {
      console.log(`${TAG} ✓ No "Login" text on page — appears logged in`);
      verified = true;
    }
  }

  if (!verified) {
    console.warn(`${TAG} ⚠ Could not confirm login state — saving session anyway.`);
    console.warn(`${TAG}   If the scraper fails, re-run this bootstrap.`);
  }

  // Save storageState + meta file with saved_at timestamp
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const state = await context.storageState();
  fs.writeFileSync(SESSION_PATH, JSON.stringify(state));

  const now = new Date();
  const meta = { saved_at: now.toISOString(), url: page.url() };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));

  console.log('');
  console.log(`${TAG} ✓ Session saved: ${SESSION_PATH}`);
  console.log(`${TAG} ✓ Meta saved: ${META_PATH}`);
  console.log(`${TAG}   Timestamp: ${now.toISOString()}`);
  console.log(`${TAG}   Expires: ~${new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()}`);
  console.log(`${TAG}   Current URL: ${page.url()}`);
  console.log('');
  console.log(`${TAG} You can now run the scraper:`);
  console.log(`${TAG}   npm run trending:daily-virals`);

  await browser.close();
}

main().catch(err => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
