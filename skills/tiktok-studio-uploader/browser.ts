// @ts-nocheck — standalone script, not part of Next.js build
/**
 * Browser context management for TikTok Studio.
 *
 * Uses a persistent Chromium profile so login survives between runs.
 * The user logs in manually once; subsequent runs reuse the session.
 *
 * Includes captcha/2FA detection with "needs-human" pause mode.
 *
 * IMPORTANT: By default, openUploadStudio runs in NON-INTERACTIVE mode
 * (fail-fast if not logged in). Only bootstrap uses interactive=true.
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as readline from 'readline';
import { CONFIG, TIMEOUTS, getLaunchOptions } from './types.js';
import {
  LOGIN_INDICATORS,
  CAPTCHA_INDICATORS,
  TWO_FA_INDICATORS,
  BLOCKER_INDICATORS,
} from './selectors.js';

export interface StudioSession {
  context: BrowserContext;
  page: Page;
}

export type BlockerType = 'captcha' | '2fa' | 'blocker' | 'login' | null;

export interface OpenStudioOptions {
  /** Allow human intervention for captcha/login? Default: false (fail-fast). */
  interactive?: boolean;
  /** Override headless. Default: CONFIG.headless */
  headless?: boolean;
}

const FAIL_FAST_MSG =
  'TikTok session expired — run `npm run tiktok:bootstrap` (one-time phone approval).';

/**
 * Launch the persistent browser and navigate to TikTok Studio upload page.
 *
 * In non-interactive mode (default): fails fast if not logged in or blocked.
 * In interactive mode (bootstrap): pauses for human intervention.
 */
export async function openUploadStudio(
  opts: OpenStudioOptions = {},
): Promise<StudioSession | null> {
  const interactive = opts.interactive ?? false;
  const headless = opts.headless ?? CONFIG.headless;

  fs.mkdirSync(CONFIG.profileDir, { recursive: true });

  // Clean stale lock files from previous crashed runs
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { fs.unlinkSync(`${CONFIG.profileDir}/${lock}`); } catch { /* doesn't exist */ }
  }

  const launchOpts = getLaunchOptions({ headless });
  const context = await chromium.launchPersistentContext(CONFIG.profileDir, launchOpts);

  const page = context.pages()[0] || (await context.newPage());

  // Navigate to upload page
  await page.goto(CONFIG.uploadUrl, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUTS.navigation,
  });
  await page.waitForTimeout(3_000); // let SPA settle

  // ── Blocker detection (captcha, 2FA, errors) ──
  const blocker = await detectBlocker(page);
  if (blocker) {
    if (!interactive) {
      // Non-interactive: fail fast, never retry login
      console.error(`[tiktok-uploader] BLOCKED: ${blocker} detected.`);
      console.error(`[tiktok-uploader] ${FAIL_FAST_MSG}`);
      await context.close();
      return null;
    }

    if (headless) {
      console.error(`[tiktok-uploader] BLOCKED: ${blocker} detected in headless mode.`);
      console.error('Re-run with TIKTOK_HEADLESS=false to handle manually.');
      await context.close();
      return null;
    }

    // Interactive + headed — pause for human intervention
    const resolved = await waitForHumanIntervention(page, blocker);
    if (!resolved) {
      await context.close();
      return null;
    }
  }

  // ── Login check ──
  const loggedIn = await checkLogin(page);
  if (!loggedIn) {
    if (!interactive) {
      // Non-interactive: fail fast with explicit message
      console.error(`[tiktok-uploader] NOT LOGGED IN.`);
      console.error(`[tiktok-uploader] ${FAIL_FAST_MSG}`);
      await context.close();
      return null;
    }

    if (headless) {
      console.error('[tiktok-uploader] Not logged in and running headless — cannot log in.');
      console.error(`[tiktok-uploader] ${FAIL_FAST_MSG}`);
      await context.close();
      return null;
    }

    // Interactive + headed — wait for manual login
    console.log('[tiktok-uploader] Not logged in. Please log in manually in the browser...');
    const resolved = await waitForHumanIntervention(page, 'login');
    if (resolved) {
      // Re-navigate to upload page after login
      await page.goto(CONFIG.uploadUrl, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUTS.navigation,
      });
      await page.waitForTimeout(3_000);
      return { context, page };
    }
    await context.close();
    return null;
  }

  return { context, page };
}

/**
 * Detect captcha, 2FA, or other blockers on the page.
 */
async function detectBlocker(page: Page): Promise<BlockerType> {
  const checks: Array<{ type: BlockerType; selectors: readonly string[] }> = [
    { type: 'captcha', selectors: CAPTCHA_INDICATORS },
    { type: '2fa', selectors: TWO_FA_INDICATORS },
    { type: 'blocker', selectors: BLOCKER_INDICATORS },
  ];

  for (const { type, selectors } of checks) {
    for (const sel of selectors) {
      try {
        const visible = await page.locator(sel).first().isVisible({ timeout: 1_500 });
        if (visible) {
          console.log(`[tiktok-uploader] Detected ${type}: ${sel}`);
          return type;
        }
      } catch {
        // selector not found — keep checking
      }
    }
  }

  return null;
}

/**
 * Returns true if the page shows a logged-in state.
 */
async function checkLogin(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('/login') || url.includes('/auth') || url.includes('/signup')) {
    return false;
  }

  for (const sel of LOGIN_INDICATORS) {
    try {
      const visible = await page.locator(sel).first().isVisible({ timeout: 2_000 });
      if (visible) return false;
    } catch {
      // selector not found — good
    }
  }

  return true;
}

/**
 * Pause execution and wait for the user to resolve a blocker manually.
 * Polls the page every 5 seconds to check if the blocker is resolved.
 * Returns true if resolved, false if the user gives up.
 */
async function waitForHumanIntervention(
  page: Page,
  blockerType: BlockerType,
): Promise<boolean> {
  const messages: Record<string, string> = {
    captcha: 'CAPTCHA detected. Please solve it in the browser window.',
    '2fa': 'Two-factor authentication required. Please enter the code in the browser.',
    blocker: 'TikTok is blocking access. Please resolve the issue in the browser.',
    login: 'Login required. Please log in to TikTok in the browser window.',
  };

  console.log('\n' + '='.repeat(60));
  console.log(`  NEEDS HUMAN INTERVENTION`);
  console.log(`  ${messages[blockerType || 'blocker']}`);
  console.log('='.repeat(60));
  console.log('  Waiting for you to resolve this in the browser...');
  console.log('  (Press Enter once done, or type "quit" to abort)\n');

  // Start a background poll + stdin listener race
  const MAX_WAIT_MS = 600_000; // 10 minutes max
  const POLL_INTERVAL = 5_000;
  const startTime = Date.now();

  return new Promise<boolean>((resolve) => {
    let resolved = false;

    // Poll for blocker resolution
    const pollTimer = setInterval(async () => {
      if (resolved) return;

      // Check if blocker is gone
      const stillBlocked = await detectBlocker(page);
      const isLoggedIn = blockerType === 'login' ? await checkLogin(page) : true;

      if (!stillBlocked && isLoggedIn) {
        resolved = true;
        clearInterval(pollTimer);
        rl.close();
        console.log('[tiktok-uploader] Blocker resolved! Continuing...\n');
        resolve(true);
        return;
      }

      if (Date.now() - startTime > MAX_WAIT_MS) {
        resolved = true;
        clearInterval(pollTimer);
        rl.close();
        console.log('[tiktok-uploader] Timed out waiting for human intervention.');
        resolve(false);
      }
    }, POLL_INTERVAL);

    // Listen for stdin
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', (line) => {
      if (resolved) return;
      if (line.trim().toLowerCase() === 'quit') {
        resolved = true;
        clearInterval(pollTimer);
        rl.close();
        console.log('[tiktok-uploader] Aborted by user.');
        resolve(false);
      } else {
        // User pressed Enter — assume they resolved it
        resolved = true;
        clearInterval(pollTimer);
        rl.close();
        console.log('[tiktok-uploader] Continuing...\n');
        resolve(true);
      }
    });
  });
}

/**
 * Gracefully close the browser session.
 */
export async function closeSession(session: StudioSession, delayMs = 0): Promise<void> {
  if (delayMs > 0) await session.page.waitForTimeout(delayMs);
  await session.context.close();
}
