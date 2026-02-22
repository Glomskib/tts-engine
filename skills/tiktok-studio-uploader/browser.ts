// @ts-nocheck — standalone script, not part of Next.js build
/**
 * Browser context management for TikTok Studio.
 *
 * Uses a persistent Chromium profile so login survives between runs.
 * The user logs in manually once; subsequent runs reuse the session.
 *
 * Session strategy (in priority order):
 *   1. launchPersistentContext(profileDir) — primary, cookies survive restarts
 *   2. storageState JSON fallback — if persistent profile is corrupt/missing
 *
 * Includes captcha/2FA detection with "needs-human" pause mode.
 *
 * IMPORTANT: By default, openUploadStudio runs in NON-INTERACTIVE mode
 * (fail-fast if not logged in). Only bootstrap uses interactive=true.
 *
 * Env vars that affect behavior:
 *   TIKTOK_BOOTSTRAP_LOGIN=1  → launch headed, wait for manual login, save & exit
 *   FORCE_RELOGIN=1           → if session expired, run bootstrap instead of fail-fast
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { CONFIG, TIMEOUTS, getLaunchOptions } from './types.js';
import {
  LOGIN_INDICATORS,
  CAPTCHA_INDICATORS,
  TWO_FA_INDICATORS,
  BLOCKER_INDICATORS,
} from './selectors.js';

const TAG = '[tiktok-session]';

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

// ─── StorageState Helpers ────────────────────────────────────────────────────

/**
 * Validate and load storageState JSON. If corrupt, move it aside and return null.
 */
function loadStorageState(): object | null {
  const ssPath = CONFIG.storageStatePath;
  if (!fs.existsSync(ssPath)) {
    console.log(`${TAG} No storageState backup at ${ssPath}`);
    return null;
  }

  try {
    const raw = fs.readFileSync(ssPath, 'utf-8');
    const parsed = JSON.parse(raw);

    // Basic shape validation — must have cookies array
    if (!parsed || !Array.isArray(parsed.cookies)) {
      throw new Error('Missing or invalid cookies array');
    }

    console.log(`${TAG} StorageState loaded (${parsed.cookies.length} cookies) from ${ssPath}`);
    return parsed;
  } catch (err: any) {
    // Corrupt — move aside with timestamp
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const corruptPath = `${ssPath}.corrupt-${ts}`;
    try {
      fs.renameSync(ssPath, corruptPath);
      console.warn(`${TAG} StorageState corrupt: ${err.message}`);
      console.warn(`${TAG} Moved to ${corruptPath}`);
    } catch {
      console.warn(`${TAG} StorageState corrupt and could not be moved aside: ${err.message}`);
    }
    return null;
  }
}

/**
 * Save storageState backup + meta file after a successful session.
 */
export async function saveSessionBackup(context: BrowserContext): Promise<void> {
  try {
    const ssDir = path.dirname(CONFIG.storageStatePath);
    fs.mkdirSync(ssDir, { recursive: true });

    await context.storageState({ path: CONFIG.storageStatePath });

    const now = new Date();
    const meta = {
      saved_at: now.toISOString(),
      profile_dir: CONFIG.profileDir,
      storage_state: CONFIG.storageStatePath,
    };
    fs.writeFileSync(CONFIG.metaFilePath, JSON.stringify(meta, null, 2));

    console.log(`${TAG} Session backup saved → ${CONFIG.storageStatePath}`);
  } catch (err: any) {
    // Non-critical — persistent profile is the primary store
    console.warn(`${TAG} Failed to save session backup: ${err.message}`);
  }
}

/**
 * Write a session-invalid event file so external monitoring can detect it.
 */
function writeSessionInvalidEvent(reason: string): void {
  try {
    const dir = CONFIG.errorDir;
    fs.mkdirSync(dir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const eventFile = path.join(dir, `session-invalid-${ts}.json`);
    const event = {
      type: 'session_invalid',
      timestamp: new Date().toISOString(),
      reason,
      profile_dir: CONFIG.profileDir,
      action_required: 'Run: npm run tiktok:bootstrap',
    };
    fs.writeFileSync(eventFile, JSON.stringify(event, null, 2));
    console.log(`${TAG} Session-invalid event written → ${eventFile}`);
  } catch {
    // Best-effort
  }
}

// ─── Singleton Lock Cleanup ──────────────────────────────────────────────────

function cleanStaleLocks(): void {
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try {
      fs.unlinkSync(path.join(CONFIG.profileDir, lock));
    } catch {
      /* doesn't exist */
    }
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Launch the persistent browser and navigate to TikTok Studio upload page.
 *
 * Modes (auto-detected from env vars):
 *   TIKTOK_BOOTSTRAP_LOGIN=1 → headed + interactive (manual login bootstrap)
 *   FORCE_RELOGIN=1          → if not logged in, switch to interactive bootstrap
 *   (default)                → fail-fast if not logged in
 *
 * In non-interactive mode (default): fails fast if not logged in or blocked.
 * In interactive mode (bootstrap): pauses for human intervention.
 */
export async function openUploadStudio(
  opts: OpenStudioOptions = {},
): Promise<StudioSession | null> {
  // Resolve effective mode from opts + env vars
  const isBootstrap = CONFIG.bootstrapLogin;
  const allowForceRelogin = CONFIG.forceRelogin;
  let interactive = opts.interactive ?? isBootstrap;
  const headless = isBootstrap ? false : (opts.headless ?? CONFIG.headless);

  // ── Verbose startup logging ──
  console.log('');
  console.log(`${TAG} ── Session startup ──`);
  console.log(`${TAG} Mode:           ${isBootstrap ? 'BOOTSTRAP (manual login)' : allowForceRelogin ? 'UPLOAD (force-relogin enabled)' : 'UPLOAD (fail-fast)'}`);
  console.log(`${TAG} Headless:       ${headless}`);
  console.log(`${TAG} Profile dir:    ${CONFIG.profileDir}`);
  console.log(`${TAG} StorageState:   ${CONFIG.storageStatePath}`);
  console.log(`${TAG} Upload URL:     ${CONFIG.uploadUrl}`);
  console.log(`${TAG} Interactive:    ${interactive}`);
  console.log('');

  // Ensure profile directory exists
  fs.mkdirSync(CONFIG.profileDir, { recursive: true });
  cleanStaleLocks();

  // ── Launch persistent context (primary approach) ──
  console.log(`${TAG} Launching persistent context...`);
  const launchOpts = getLaunchOptions({ headless });
  let context: BrowserContext;

  try {
    context = await chromium.launchPersistentContext(CONFIG.profileDir, launchOpts);
    console.log(`${TAG} Persistent context launched (profile reused).`);
  } catch (err: any) {
    console.warn(`${TAG} Persistent context failed: ${err.message}`);
    console.log(`${TAG} Attempting fallback with storageState...`);

    // Fallback: launch non-persistent with storageState
    const ssData = loadStorageState();
    if (!ssData) {
      console.error(`${TAG} No valid storageState fallback available.`);
      console.error(`${TAG} ${FAIL_FAST_MSG}`);
      writeSessionInvalidEvent('Persistent context launch failed and no storageState fallback');
      return null;
    }

    try {
      const browser = await chromium.launch({
        headless,
        args: launchOpts.args,
      });
      context = await browser.newContext({
        ...launchOpts,
        storageState: CONFIG.storageStatePath,
      });
      console.log(`${TAG} Fallback: launched with storageState (non-persistent).`);
      console.warn(`${TAG} WARNING: Session changes will NOT persist across restarts.`);
      console.warn(`${TAG} Re-run tiktok:bootstrap to fix the persistent profile.`);
    } catch (err2: any) {
      console.error(`${TAG} StorageState fallback also failed: ${err2.message}`);
      console.error(`${TAG} ${FAIL_FAST_MSG}`);
      writeSessionInvalidEvent('Both persistent context and storageState fallback failed');
      return null;
    }
  }

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
      console.error(`${TAG} BLOCKED: ${blocker} detected.`);
      console.error(`${TAG} ${FAIL_FAST_MSG}`);
      writeSessionInvalidEvent(`Blocker detected: ${blocker}`);
      await context.close();
      return null;
    }

    if (headless) {
      console.error(`${TAG} BLOCKED: ${blocker} detected in headless mode.`);
      console.error('Re-run with TIKTOK_HEADLESS=false to handle manually.');
      writeSessionInvalidEvent(`Blocker in headless: ${blocker}`);
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
    // If FORCE_RELOGIN=1, escalate to interactive mode
    if (allowForceRelogin && !interactive) {
      console.log(`${TAG} Session expired + FORCE_RELOGIN=1 → switching to interactive bootstrap.`);
      interactive = true;
    }

    if (!interactive) {
      // Non-interactive: fail fast with explicit message
      console.error(`${TAG} NOT LOGGED IN.`);
      console.error(`${TAG} ${FAIL_FAST_MSG}`);
      writeSessionInvalidEvent('Not logged in — session expired');
      await context.close();
      return null;
    }

    if (headless) {
      console.error(`${TAG} Not logged in and running headless — cannot log in.`);
      console.error(`${TAG} ${FAIL_FAST_MSG}`);
      writeSessionInvalidEvent('Not logged in in headless mode');
      await context.close();
      return null;
    }

    // Interactive + headed — wait for manual login
    console.log(`${TAG} Not logged in. Please log in manually in the browser...`);
    const resolved = await waitForHumanIntervention(page, 'login');
    if (resolved) {
      // Save session immediately after login
      await saveSessionBackup(context);

      // If bootstrap mode, we're done — save and exit
      if (isBootstrap) {
        console.log(`${TAG} Bootstrap complete — session saved. Exiting.`);
        await context.close();
        process.exit(0);
      }

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

  // Already logged in
  console.log(`${TAG} Login confirmed — session is valid.`);

  // If bootstrap mode and already logged in, just save and exit
  if (isBootstrap) {
    await saveSessionBackup(context);
    console.log(`${TAG} Bootstrap: already logged in — session saved. Exiting.`);
    await context.close();
    process.exit(0);
  }

  return { context, page };
}

// ─── Blocker Detection ───────────────────────────────────────────────────────

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
          console.log(`${TAG} Detected ${type}: ${sel}`);
          return type;
        }
      } catch {
        // selector not found — keep checking
      }
    }
  }

  return null;
}

// ─── Login Check ─────────────────────────────────────────────────────────────

/**
 * Returns true if the page shows a logged-in state.
 */
async function checkLogin(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('/login') || url.includes('/auth') || url.includes('/signup')) {
    console.log(`${TAG} Login check: URL indicates not logged in (${url})`);
    return false;
  }

  for (const sel of LOGIN_INDICATORS) {
    try {
      const visible = await page.locator(sel).first().isVisible({ timeout: 2_000 });
      if (visible) {
        console.log(`${TAG} Login check: found login indicator "${sel}"`);
        return false;
      }
    } catch {
      // selector not found — good
    }
  }

  return true;
}

// ─── Human Intervention ──────────────────────────────────────────────────────

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
        console.log(`${TAG} Blocker resolved! Continuing...\n`);
        resolve(true);
        return;
      }

      if (Date.now() - startTime > MAX_WAIT_MS) {
        resolved = true;
        clearInterval(pollTimer);
        rl.close();
        console.log(`${TAG} Timed out waiting for human intervention.`);
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
        console.log(`${TAG} Aborted by user.`);
        resolve(false);
      } else {
        // User pressed Enter — assume they resolved it
        resolved = true;
        clearInterval(pollTimer);
        rl.close();
        console.log(`${TAG} Continuing...\n`);
        resolve(true);
      }
    });
  });
}

// ─── Session Teardown ────────────────────────────────────────────────────────

/**
 * Gracefully close the browser session. Saves storageState backup before closing.
 */
export async function closeSession(session: StudioSession, delayMs = 0): Promise<void> {
  if (delayMs > 0) await session.page.waitForTimeout(delayMs);

  // Always save session backup on close to keep cookies fresh
  await saveSessionBackup(session.context);

  await session.context.close();
}
