#!/usr/bin/env tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * Slot-Aware TikTok Bootstrap
 *
 * Opens a headed browser with the slot's Chrome profile directory
 * so the user can log in manually. Session persists for future runs.
 *
 * Usage:
 *   npm run tiktok:bootstrap:slot -- --slot wife
 *   FF_SLOT=wife npm run tiktok:bootstrap:slot
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { requireSlot, applySlotEnv } from '../../lib/client-slots';
import { chromium, type Page, type BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const TAG = '[tiktok:bootstrap:slot]';

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 5 * 60_000;

const NOT_LOGGED_IN = [
  'button:has-text("Log in")',
  'button:has-text("Sign up")',
  'input[name="username"]',
];

const LOGGED_IN_INDICATORS = [
  '[data-e2e="save_draft_button"]',
  'input[type="file"]',
  '[contenteditable="true"]',
  '[data-e2e="post_video_button"]',
];

const UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
  // Load and apply slot config — sets env vars before anything else
  const slot = requireSlot();
  applySlotEnv(slot);

  const profileDir = slot.chrome_profile_dir;
  const storageStatePath = process.env.TIKTOK_STORAGE_STATE!;
  const metaFilePath = path.join(path.dirname(profileDir), `${path.basename(profileDir)}.meta.json`);

  console.log('');
  console.log(`${TAG} Bootstrapping TikTok session for slot: ${slot.slot}`);
  console.log(`${TAG} Client ID:   ${slot.client_id}`);
  console.log(`${TAG} Profile:     ${profileDir}`);
  console.log(`${TAG} URL:         ${UPLOAD_URL}`);
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

  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (err: any) {
    console.error(`${TAG} Page load issue: ${err.message}`);
    console.log(`${TAG} Browser is still open — complete any challenge manually.`);
  }

  await page.waitForTimeout(3_000);

  const initial = await isLoggedIn(page);
  if (initial.loggedIn) {
    console.log(`${TAG} Already logged in: ${initial.reason}`);
    await saveState(context, page, true, slot, storageStatePath, metaFilePath);
    await context.close();
    return;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`  LOG IN TO TIKTOK for slot: ${slot.slot}`);
  console.log('  Session auto-saves when login is detected.');
  console.log('  Press Enter to force-save, or type "quit" to abort.');
  console.log('='.repeat(60));
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
  if (final.loggedIn) {
    console.log(`${TAG} Login confirmed: ${final.reason}`);
  } else {
    console.warn(`${TAG} Login NOT confirmed: ${final.reason}`);
    console.warn(`${TAG} Saving session anyway — next run may require re-login.`);
  }

  await saveState(context, page, final.loggedIn, slot, storageStatePath, metaFilePath);
  await context.close();
}

async function saveState(
  context: BrowserContext,
  page: Page,
  verified: boolean,
  slot: ReturnType<typeof requireSlot>,
  storageStatePath: string,
  metaFilePath: string,
) {
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });

  const state = await context.storageState();
  fs.writeFileSync(storageStatePath, JSON.stringify(state));

  const now = new Date();
  const meta = {
    saved_at: now.toISOString(),
    url: page.url(),
    verified,
    slot: slot.slot,
    client_id: slot.client_id,
    profile_dir: slot.chrome_profile_dir,
  };
  fs.writeFileSync(metaFilePath, JSON.stringify(meta, null, 2));

  console.log('');
  console.log(`${TAG} Session saved for slot: ${slot.slot}`);
  console.log(`${TAG}   Profile:       ${slot.chrome_profile_dir}`);
  console.log(`${TAG}   StorageState:  ${storageStatePath}`);
  console.log(`${TAG}   Meta:          ${metaFilePath}`);
  console.log(`${TAG}   Verified:      ${verified}`);
  console.log(`${TAG}   Client ID:     ${slot.client_id}`);
  console.log(`${TAG}   Timestamp:     ${now.toISOString()}`);
  console.log('');
  console.log(`${TAG} Next run should land on Studio without login.`);
  console.log(`${TAG} To test: npm run tiktok:check-session`);
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err.message);
  process.exit(1);
});
