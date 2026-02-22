// @ts-nocheck — standalone script, not part of Next.js build
/**
 * Browser context management for TikTok Studio.
 *
 * Uses a persistent Chromium profile so login survives between runs.
 * The user logs in manually once; subsequent runs reuse the session.
 *
 * Includes captcha/2FA detection with "needs-human" pause mode.
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as readline from 'readline';
import { CONFIG, TIMEOUTS } from './types.js';
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

/**
 * Launch the persistent browser and navigate to TikTok Studio upload page.
 * Returns null if the user is not logged in.
 * Pauses for human intervention if captcha/2FA is detected.
 */
export async function openUploadStudio(): Promise<StudioSession | null> {
  fs.mkdirSync(CONFIG.profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(CONFIG.profileDir, {
    headless: CONFIG.headless,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

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
    if (CONFIG.headless) {
      // Can't pause in headless — close and report
      console.error(`[tiktok-uploader] BLOCKED: ${blocker} detected in headless mode.`);
      console.error('Re-run with TIKTOK_HEADLESS=false to handle manually.');
      await context.close();
      return null;
    }

    // Headed mode — pause for human intervention
    const resolved = await waitForHumanIntervention(page, blocker);
    if (!resolved) {
      await context.close();
      return null;
    }
  }

  // ── Login check ──
  const loggedIn = await checkLogin(page);
  if (!loggedIn) {
    if (!CONFIG.headless) {
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
    captcha: '🔒 CAPTCHA detected. Please solve it in the browser window.',
    '2fa': '🔐 Two-factor authentication required. Please enter the code in the browser.',
    blocker: '⚠️  TikTok is blocking access. Please resolve the issue in the browser.',
    login: '🔑 Login required. Please log in to TikTok in the browser window.',
  };

  console.log('\n' + '='.repeat(60));
  console.log(`  NEEDS HUMAN INTERVENTION`);
  console.log(`  ${messages[blockerType || 'blocker']}`);
  console.log('='.repeat(60));
  console.log('  Waiting for you to resolve this in the browser...');
  console.log('  (Press Enter once done, or type "quit" to abort)\n');

  // Start a background poll + stdin listener race
  const MAX_WAIT_MS = 300_000; // 5 minutes max
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
        console.log('[tiktok-uploader] ✓ Blocker resolved! Continuing...\n');
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
        console.log('[tiktok-uploader] ✓ Continuing...\n');
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
