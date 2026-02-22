#!/usr/bin/env tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Studio Bootstrap — one-time login with a persistent Chromium profile.
 *
 * Uses launchPersistentContext so cookies, localStorage, and IndexedDB
 * survive after the browser closes.  Log in once; every subsequent
 * `tiktok:upload` run lands on Studio without re-auth.
 *
 * Also saves a storageState JSON as backup.
 *
 * Usage:
 *   npm run tiktok:bootstrap
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { chromium, type Page, type BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG, getLaunchOptions } from '../../../../skills/tiktok-studio-uploader/types.js';

const TAG = '[tiktok:bootstrap]';

const PROFILE_DIR = CONFIG.profileDir;
const STATE_DIR = path.join(process.cwd(), 'data', 'sessions');
const STATE_FILE = path.join(STATE_DIR, 'tiktok-studio.storageState.json');
const META_FILE = path.join(STATE_DIR, 'tiktok-studio.meta.json');
const UPLOAD_URL = CONFIG.uploadUrl;

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 5 * 60_000; // 5 minutes

/** Selectors that prove the user is NOT logged in. */
const NOT_LOGGED_IN = [
  'button:has-text("Log in")',
  'button:has-text("Sign up")',
  'input[name="username"]',
];

/** Positive logged-in indicators on TikTok Studio. */
const LOGGED_IN_INDICATORS = [
  '[data-e2e="save_draft_button"]',
  'input[type="file"]',
  '[contenteditable="true"]',
  '[data-e2e="post_video_button"]',
];

async function isLoggedIn(page: Page): Promise<{ loggedIn: boolean; reason: string }> {
  const url = page.url();
  if (url.includes('/login') || url.includes('/auth') || url.includes('/signup')) {
    return { loggedIn: false, reason: 'URL contains login/auth path' };
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
      if (el) return { loggedIn: true, reason: `Found logged-in indicator: ${sel}` };
    } catch { /* next */ }
  }

  return { loggedIn: true, reason: 'No login indicators found' };
}

async function main() {
  console.log(`${TAG} Launching headed browser with persistent profile...`);
  console.log(`${TAG} Profile: ${PROFILE_DIR}`);
  console.log(`${TAG} URL:     ${UPLOAD_URL}`);
  console.log('');

  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  // Clean stale lock files from previous crashed runs
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const lockPath = path.join(PROFILE_DIR, lock);
    try { fs.unlinkSync(lockPath); } catch { /* doesn't exist */ }
  }

  // Use shared launch options for consistent fingerprint — always headed for bootstrap
  const launchOpts = getLaunchOptions({ headless: false });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, launchOpts);

  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (err: any) {
    console.error(`${TAG} Page load issue: ${err.message}`);
    console.log(`${TAG} Browser is still open — complete any challenge manually.`);
  }

  await page.waitForTimeout(3_000);

  // Check if already logged in
  const initial = await isLoggedIn(page);
  if (initial.loggedIn) {
    console.log(`${TAG} Already logged in: ${initial.reason}`);
    await saveState(context, page, true);
    await context.close();
    return;
  }

  // Wait for login
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

    // stdin listener
    if (process.stdin.isTTY) {
      process.stdin.setRawMode?.(false);
    }
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      const text = data.toString().trim().toLowerCase();
      if (text === 'quit') {
        done('timeout');
      } else {
        console.log(`${TAG} Manual Enter received`);
        done('manual');
      }
    });
  });

  if (result === 'timeout') {
    console.error(`${TAG} Aborted — no login detected.`);
    await context.close();
    process.exit(1);
  }

  // Verify
  const final = await isLoggedIn(page);
  if (final.loggedIn) {
    console.log(`${TAG} Login confirmed: ${final.reason}`);
  } else {
    console.warn(`${TAG} Login NOT confirmed: ${final.reason}`);
    console.warn(`${TAG} Saving session anyway — next run may require re-login.`);
  }

  await saveState(context, page, final.loggedIn);
  await context.close();
}

async function saveState(context: BrowserContext, page: Page, verified: boolean) {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // Save storageState as backup
  const state = await context.storageState();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));

  const now = new Date();
  const meta = {
    saved_at: now.toISOString(),
    url: page.url(),
    verified,
    profile_dir: PROFILE_DIR,
  };
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));

  console.log('');
  console.log(`${TAG} Profile saved:       ${PROFILE_DIR}`);
  console.log(`${TAG} StorageState backup: ${STATE_FILE}`);
  console.log(`${TAG} Meta:                ${META_FILE}`);
  console.log(`${TAG} Verified:            ${verified}`);
  console.log(`${TAG} Timestamp:           ${now.toISOString()}`);
  console.log('');
  console.log(`${TAG} Next run should land on Studio without login.`);
  console.log(`${TAG} To test:   npm run tiktok:check-session`);
  console.log(`${TAG} To upload: npm run tiktok:upload -- --pack-dir <dir>`);
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err.message);
  process.exit(1);
});
