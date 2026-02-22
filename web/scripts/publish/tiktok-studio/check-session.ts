#!/usr/bin/env tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Studio Check Session — verifies persistent login is still valid.
 *
 * Opens the persistent Chromium profile, navigates to TikTok Studio,
 * and prints LOGGED_IN=true or LOGGED_IN=false.
 *
 * Usage:
 *   npm run tiktok:check-session
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const TAG = '[tiktok:check-session]';

const PROFILE_DIR =
  process.env.TIKTOK_BROWSER_PROFILE ||
  path.join(process.cwd(), 'data', 'sessions', 'tiktok-studio-profile');

const UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload';

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

async function main() {
  if (!fs.existsSync(PROFILE_DIR)) {
    console.log(`${TAG} LOGGED_IN=false`);
    console.log(`${TAG} Reason: No profile directory at ${PROFILE_DIR}`);
    console.log(`${TAG} Run:    npm run tiktok:bootstrap`);
    process.exit(1);
  }

  console.log(`${TAG} Profile: ${PROFILE_DIR}`);
  console.log(`${TAG} Opening browser...`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(4_000);

    const url = page.url();

    // Check URL-based redirect to login
    if (url.includes('/login') || url.includes('/auth') || url.includes('/signup')) {
      console.log(`${TAG} LOGGED_IN=false`);
      console.log(`${TAG} Reason: Redirected to ${url}`);
      console.log(`${TAG} Run:    npm run tiktok:bootstrap`);
      await context.close();
      process.exit(1);
    }

    // Check for not-logged-in selectors
    for (const sel of NOT_LOGGED_IN) {
      try {
        const visible = await page.locator(sel).first().isVisible({ timeout: 2_000 });
        if (visible) {
          console.log(`${TAG} LOGGED_IN=false`);
          console.log(`${TAG} Reason: Found login indicator: ${sel}`);
          console.log(`${TAG} Run:    npm run tiktok:bootstrap`);
          await context.close();
          process.exit(1);
        }
      } catch { /* next */ }
    }

    // Check for positive logged-in indicators
    let foundIndicator = '';
    for (const sel of LOGGED_IN_INDICATORS) {
      try {
        const el = await page.$(sel);
        if (el) {
          foundIndicator = sel;
          break;
        }
      } catch { /* next */ }
    }

    console.log(`${TAG} LOGGED_IN=true`);
    if (foundIndicator) {
      console.log(`${TAG} Reason: Found ${foundIndicator}`);
    } else {
      console.log(`${TAG} Reason: No login prompts detected`);
    }
    console.log(`${TAG} URL:    ${url}`);
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error(`${TAG} Error: ${err.message}`);
  console.log(`${TAG} LOGGED_IN=false`);
  process.exit(1);
});
