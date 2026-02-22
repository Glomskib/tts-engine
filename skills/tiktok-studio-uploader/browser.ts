// @ts-nocheck — standalone script, not part of Next.js build
/**
 * Browser context management for TikTok Studio.
 *
 * Uses a persistent Chromium profile so login survives between runs.
 * The user logs in manually once; subsequent runs reuse the session.
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import { CONFIG, TIMEOUTS } from './types.js';
import { LOGIN_INDICATORS } from './selectors.js';

export interface StudioSession {
  context: BrowserContext;
  page: Page;
}

/**
 * Launch the persistent browser and navigate to TikTok Studio upload page.
 * Returns null if the user is not logged in.
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

  // ── Login check ──
  const loggedIn = await checkLogin(page);
  if (!loggedIn) {
    await context.close();
    return null;
  }

  return { context, page };
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
 * Gracefully close the browser session.
 */
export async function closeSession(session: StudioSession, delayMs = 0): Promise<void> {
  if (delayMs > 0) await session.page.waitForTimeout(delayMs);
  await session.context.close();
}
