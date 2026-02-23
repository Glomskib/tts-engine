#!/usr/bin/env tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Studio Check Session — verifies persistent login is still valid.
 *
 * Opens the persistent Chromium profile, navigates to TikTok Studio,
 * and prints LOGGED_IN=true or LOGGED_IN=false.
 *
 * Exit codes:
 *   0  = logged in
 *   1  = error (couldn't open browser, etc.)
 *   42 = not logged in (session expired — needs manual bootstrap)
 *
 * Usage:
 *   npm run tiktok:check-session
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { CONFIG, getLaunchOptions } from '../../../../skills/tiktok-studio-uploader/types.js';

const TAG = '[tiktok:check-session]';
const SESSION_TTL_HOURS = parseInt(process.env.SESSION_TTL_HOURS || '24', 10);

// ─── Session validity logging (standalone Supabase client) ──────────────────

async function logSessionValidity(isValid: boolean, reason: string): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log(`${TAG} Skipping session-status log (no Supabase credentials).`);
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    const { error } = await supabase
      .from('ff_session_status')
      .upsert(
        {
          node_name: os.hostname(),
          platform: 'tiktok_studio',
          account_id: null,
          is_valid: isValid,
          reason,
          last_validated_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: 'node_name,platform', ignoreDuplicates: false },
      );

    if (error) {
      console.error(`${TAG} Session-status log error: ${error.message}`);
    } else {
      console.log(`${TAG} Session-status logged: is_valid=${isValid}, reason=${reason}`);
    }
  } catch (err: any) {
    console.error(`${TAG} Session-status log exception: ${err.message}`);
  }
}

const PROFILE_DIR = CONFIG.profileDir;
const UPLOAD_URL = CONFIG.uploadUrl;

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
    await logSessionValidity(false, 'No profile directory');
    process.exit(42);
  }

  console.log(`${TAG} Profile: ${PROFILE_DIR}`);
  console.log(`${TAG} Opening browser...`);

  // Clean stale lock files from previous crashed runs
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const lockPath = path.join(PROFILE_DIR, lock);
    try { fs.unlinkSync(lockPath); } catch { /* doesn't exist */ }
  }

  // Use shared launch options for consistent fingerprint — headed for check
  const launchOpts = getLaunchOptions({ headless: false });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, launchOpts);

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
      await logSessionValidity(false, `Redirected to ${url}`);
      await context.close();
      process.exit(42);
    }

    // Check for not-logged-in selectors
    for (const sel of NOT_LOGGED_IN) {
      try {
        const visible = await page.locator(sel).first().isVisible({ timeout: 2_000 });
        if (visible) {
          console.log(`${TAG} LOGGED_IN=false`);
          console.log(`${TAG} Reason: Found login indicator: ${sel}`);
          console.log(`${TAG} Run:    npm run tiktok:bootstrap`);
          await logSessionValidity(false, `Found login indicator: ${sel}`);
          await context.close();
          process.exit(42);
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

    const reason = foundIndicator
      ? `Found ${foundIndicator}`
      : 'No login prompts detected';

    console.log(`${TAG} LOGGED_IN=true`);
    console.log(`${TAG} Reason: ${reason}`);
    console.log(`${TAG} URL:    ${url}`);

    await logSessionValidity(true, reason);
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error(`${TAG} Error: ${err.message}`);
  console.log(`${TAG} LOGGED_IN=false`);
  process.exit(1);
});
