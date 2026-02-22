#!/usr/bin/env tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * Bootstrap TikTok Studio session — opens a headed browser so you can
 * log in manually (QR code / phone), then saves the Playwright
 * storageState for the automated uploader.
 *
 * Usage:
 *   npm run tiktok:bootstrap
 *
 * The saved session is reused until it expires (~24-72 hours).
 * Re-run this script whenever the upload script reports auth failure.
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const TAG = '[tiktok-studio:bootstrap]';
const SESSION_DIR = path.join(process.cwd(), 'data/sessions');
const SESSION_PATH = path.join(SESSION_DIR, 'tiktok-studio.storageState.json');
const META_PATH = path.join(SESSION_DIR, 'tiktok-studio.meta.json');
const UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload';

async function main() {
  console.log(`${TAG} Launching headed browser...`);
  console.log(`${TAG} URL: ${UPLOAD_URL}`);
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  try {
    await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (err) {
    console.error(`${TAG} Failed to load page:`, err);
    console.log(`${TAG} The browser is still open — complete any challenge manually.`);
  }

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Log in to TikTok Studio in the browser window.     ║');
  console.log('║  Use QR code, phone, or email login.                ║');
  console.log('║  Complete any captcha / Cloudflare challenge.        ║');
  console.log('║                                                      ║');
  console.log('║  Once you can see the TikTok Studio upload page,     ║');
  console.log('║  press ENTER in this terminal.                       ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) =>
    rl.question('  → Press ENTER after logging in... ', () => resolve()),
  );
  rl.close();

  // Verify login state using LOGIN_INDICATORS from selectors
  console.log(`${TAG} Verifying login state...`);
  let verified = false;

  const LOGIN_INDICATORS = [
    'button:has-text("Log in")',
    'button:has-text("Sign up")',
    'input[name="username"]',
  ];

  // Check URL — if redirected to login page, not logged in
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/auth') || currentUrl.includes('/signup')) {
    console.warn(`${TAG} ⚠ URL indicates login page: ${currentUrl}`);
  } else {
    // Check that login indicators are NOT visible
    let loginVisible = false;
    for (const sel of LOGIN_INDICATORS) {
      try {
        const vis = await page.locator(sel).first().isVisible({ timeout: 2_000 });
        if (vis) {
          loginVisible = true;
          break;
        }
      } catch {
        // not found — good
      }
    }

    if (!loginVisible) {
      console.log(`${TAG} ✓ No login indicators visible — appears logged in`);
      verified = true;
    }
  }

  if (!verified) {
    console.warn(`${TAG} ⚠ Could not confirm login state — saving session anyway.`);
    console.warn(`${TAG}   If the upload script fails, re-run this bootstrap.`);
  }

  // Save storageState + meta file
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const state = await context.storageState();
  fs.writeFileSync(SESSION_PATH, JSON.stringify(state));

  const now = new Date();
  const meta = { saved_at: now.toISOString(), url: page.url() };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));

  console.log('');
  console.log(`${TAG} ✓ Session saved: ${SESSION_PATH}`);
  console.log(`${TAG} ✓ Meta saved:    ${META_PATH}`);
  console.log(`${TAG}   Timestamp: ${now.toISOString()}`);
  console.log(`${TAG}   Current URL: ${page.url()}`);
  console.log('');
  console.log(`${TAG} You can now run the uploader:`);
  console.log(`${TAG}   npm run tiktok:upload -- --pack-dir <dir>`);

  await browser.close();
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
