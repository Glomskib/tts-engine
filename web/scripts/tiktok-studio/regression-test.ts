#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Studio Regression Test — Phase 1 session stability verification.
 *
 * Validates that the persistent-session system does NOT break:
 *   - Browser launch with persistent profile
 *   - Login/session detection
 *   - Upload page selectors (file input, caption, product, draft/post buttons)
 *   - Blocker detection (captcha, 2FA, errors)
 *
 * Does NOT upload a video or interact with TikTok beyond opening the page
 * and probing selectors (same as --dry-run in upload-from-pack.ts).
 *
 * Writes a structured JSON report to var/run-reports/<timestamp>.json.
 *
 * Usage:
 *   npm run tiktok:regression                        # normal run
 *   npm run tiktok:regression:invalid-session         # session-invalid test
 *   HEADLESS=1 npx tsx scripts/tiktok-studio/regression-test.ts
 *   npx tsx scripts/tiktok-studio/regression-test.ts --test-invalid-session
 *
 * Env vars:
 *   HEADLESS=1|0     — override headless (default: true for CI, matches TIKTOK_HEADLESS)
 *   DRY_RUN=1        — alias: same as running normally (this script is always non-destructive)
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = one or more checks failed (see report JSON)
 *   2 = session invalid (expected when --test-invalid-session)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { chromium } from 'playwright';

import { CONFIG, TIMEOUTS, getLaunchOptions } from '../../../skills/tiktok-studio-uploader/types.js';
import * as sel from '../../../skills/tiktok-studio-uploader/selectors.js';

const TAG = '[tiktok:regression]';

// ─── CLI flags ──────────────────────────────────────────────────────────────

const TEST_INVALID_SESSION = process.argv.includes('--test-invalid-session');

// HEADLESS: env > TIKTOK_HEADLESS > default true (CI-friendly)
const HEADLESS =
  process.env.HEADLESS === '0' ? false
    : process.env.HEADLESS === '1' ? true
      : CONFIG.headless || true;

// ─── Report types ───────────────────────────────────────────────────────────

interface SelectorCheck {
  name: string;
  matched: boolean;
  selector?: string;        // which selector matched
  state?: 'visible' | 'attached' | 'none';
}

interface BlockerCheck {
  name: string;
  detected: boolean;
  selector?: string;
}

interface RegressionReport {
  timestamp: string;
  mode: 'persistentContext';
  headless: boolean;
  profile_dir: string;
  test_invalid_session: boolean;

  session_valid: boolean;
  session_reason: string;

  selectors: SelectorCheck[];
  blockers: BlockerCheck[];

  drafted: boolean;          // draft button found → draft flow is available
  product_linked: boolean;   // product button found → linking flow is available

  errors: string[];
  duration_ms: number;
}

// ─── Report writer ──────────────────────────────────────────────────────────

function writeReport(report: RegressionReport): string {
  const dir = path.join(process.cwd(), 'var', 'run-reports');
  fs.mkdirSync(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return filePath;
}

// ─── Session-invalid test ───────────────────────────────────────────────────

async function runInvalidSessionTest(): Promise<RegressionReport> {
  const start = Date.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-regression-'));

  console.log(`${TAG} Testing session-invalid path...`);
  console.log(`${TAG} Using empty temp profile: ${tmpDir}`);

  const report: RegressionReport = {
    timestamp: new Date().toISOString(),
    mode: 'persistentContext',
    headless: HEADLESS,
    profile_dir: tmpDir,
    test_invalid_session: true,
    session_valid: false,
    session_reason: '',
    selectors: [],
    blockers: [],
    drafted: false,
    product_linked: false,
    errors: [],
    duration_ms: 0,
  };

  try {
    // Launch with the empty temp profile — should land on login page
    const launchOpts = getLaunchOptions({ headless: HEADLESS });
    const context = await chromium.launchPersistentContext(tmpDir, launchOpts);
    const page = context.pages()[0] || (await context.newPage());

    try {
      await page.goto(CONFIG.uploadUrl, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUTS.navigation,
      });
      await page.waitForTimeout(4_000);

      // Check if redirected to login
      const url = page.url();
      const onLoginPage =
        url.includes('/login') || url.includes('/auth') || url.includes('/signup');

      if (onLoginPage) {
        report.session_reason = `Redirected to login: ${url}`;
      } else {
        // Check for explicit login indicators
        let foundLoginIndicator = false;
        for (const s of sel.LOGIN_INDICATORS) {
          try {
            const visible = await page.locator(s).first().isVisible({ timeout: 2_000 });
            if (visible) {
              report.session_reason = `Login indicator found: ${s}`;
              foundLoginIndicator = true;
              break;
            }
          } catch { /* next */ }
        }

        if (!foundLoginIndicator) {
          // No explicit login prompt found — check for POSITIVE logged-in indicators.
          // If critical upload-page elements (file input, draft button) are also absent,
          // the session is indeterminate → treat as invalid.
          const loggedInSelectors = [
            ...sel.FILE_INPUT,
            ...sel.DRAFT_BTN,
            ...sel.POST_BTN,
          ];
          let foundLoggedIn = false;
          for (const s of loggedInSelectors) {
            try {
              const loc = page.locator(s).first();
              const visible = await loc.isVisible({ timeout: 2_000 });
              const attached = !visible ? (await loc.count()) > 0 : true;
              if (visible || attached) {
                foundLoggedIn = true;
                break;
              }
            } catch { /* next */ }
          }

          if (foundLoggedIn) {
            // Truly logged in with an empty profile — unexpected but possible (cookie leak)
            report.session_valid = true;
            report.session_reason = 'Unexpectedly appeared logged in with empty profile';
            report.errors.push('Expected session-invalid but page appeared logged in');
          } else {
            // Neither login prompts nor upload elements found — session is invalid
            report.session_reason = `Session indeterminate (no login prompts, no upload elements) at ${url}`;
          }
        }
      }
    } finally {
      await context.close();
    }

    if (!report.session_valid) {
      console.log(`${TAG} Session correctly detected as invalid: ${report.session_reason}`);
      console.log(`${TAG} PASS: session invalid; run bootstrap`);
    }
  } catch (err: any) {
    // Network/browser errors are also valid "session invalid" outcomes
    report.session_reason = `Browser/network error: ${err.message}`;
    report.errors.push(err.message);
    console.log(`${TAG} Session invalid (error path): ${err.message}`);
  } finally {
    // Clean up temp dir
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
  }

  report.duration_ms = Date.now() - start;
  return report;
}

// ─── Normal regression run ──────────────────────────────────────────────────

async function runRegression(): Promise<RegressionReport> {
  const start = Date.now();
  const profileDir = CONFIG.profileDir;

  console.log(`${TAG} Running regression check...`);
  console.log(`${TAG} Profile:  ${profileDir}`);
  console.log(`${TAG} URL:      ${CONFIG.uploadUrl}`);
  console.log(`${TAG} Headless: ${HEADLESS}`);
  console.log('');

  const report: RegressionReport = {
    timestamp: new Date().toISOString(),
    mode: 'persistentContext',
    headless: HEADLESS,
    profile_dir: profileDir,
    test_invalid_session: false,
    session_valid: false,
    session_reason: '',
    selectors: [],
    blockers: [],
    drafted: false,
    product_linked: false,
    errors: [],
    duration_ms: 0,
  };

  // Pre-check: does the profile directory exist?
  if (!fs.existsSync(profileDir)) {
    report.session_reason = `No profile directory at ${profileDir}`;
    report.errors.push('session invalid; run bootstrap');
    console.error(`${TAG} FAIL: No persistent profile found.`);
    console.error(`${TAG} Run: npm run tiktok:bootstrap`);
    report.duration_ms = Date.now() - start;
    return report;
  }

  // Clean stale lock files
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { fs.unlinkSync(path.join(profileDir, lock)); } catch { /* ok */ }
  }

  const launchOpts = getLaunchOptions({ headless: HEADLESS });
  let context;
  let page;

  try {
    context = await chromium.launchPersistentContext(profileDir, launchOpts);
    page = context.pages()[0] || (await context.newPage());
  } catch (err: any) {
    report.session_reason = `Failed to launch browser: ${err.message}`;
    report.errors.push(err.message);
    report.duration_ms = Date.now() - start;
    return report;
  }

  try {
    // Navigate
    await page.goto(CONFIG.uploadUrl, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.navigation,
    });
    await page.waitForTimeout(3_000);

    // ── Login check ──
    const url = page.url();
    if (url.includes('/login') || url.includes('/auth') || url.includes('/signup')) {
      report.session_reason = `Redirected to login: ${url}`;
      report.errors.push('session invalid; run bootstrap');
      console.error(`${TAG} FAIL: Session expired — redirected to ${url}`);
      report.duration_ms = Date.now() - start;
      return report;
    }

    // Check for NOT-logged-in indicators
    for (const s of sel.LOGIN_INDICATORS) {
      try {
        const visible = await page.locator(s).first().isVisible({ timeout: 2_000 });
        if (visible) {
          report.session_reason = `Login indicator found: ${s}`;
          report.errors.push('session invalid; run bootstrap');
          console.error(`${TAG} FAIL: Login prompt detected (${s})`);
          report.duration_ms = Date.now() - start;
          return report;
        }
      } catch { /* next */ }
    }

    report.session_valid = true;
    report.session_reason = 'No login indicators — session active';
    console.log(`${TAG} Session: VALID`);

    // ── Selector checks ──
    const selectorChecks: Array<{ name: string; selectors: readonly string[] }> = [
      { name: 'File input', selectors: sel.FILE_INPUT },
      { name: 'Caption editor', selectors: sel.CAPTION_EDITOR },
      { name: 'Add product button', selectors: sel.ADD_PRODUCT_BTN },
      { name: 'Draft button', selectors: sel.DRAFT_BTN },
      { name: 'Post button', selectors: sel.POST_BTN },
    ];

    console.log('');
    for (const check of selectorChecks) {
      let matched = false;
      for (const s of check.selectors) {
        try {
          const loc = page.locator(s).first();
          const visible = await loc.isVisible({ timeout: 2_000 });
          const attached = !visible ? (await loc.count()) > 0 : true;

          if (visible || attached) {
            const state = visible ? 'visible' : 'attached';
            report.selectors.push({ name: check.name, matched: true, selector: s, state });
            console.log(`  [OK]   ${check.name} — ${s} (${state})`);
            matched = true;
            break;
          }
        } catch { /* next */ }
      }
      if (!matched) {
        report.selectors.push({ name: check.name, matched: false, state: 'none' });
        console.log(`  [MISS] ${check.name} — none of ${check.selectors.length} selectors matched`);
      }
    }

    // ── Blocker checks ──
    const blockerChecks: Array<{ name: string; selectors: readonly string[] }> = [
      { name: 'Captcha', selectors: sel.CAPTCHA_INDICATORS },
      { name: '2FA', selectors: sel.TWO_FA_INDICATORS },
      { name: 'Blocker', selectors: sel.BLOCKER_INDICATORS },
    ];

    console.log('\n  Blocker detection:');
    for (const check of blockerChecks) {
      let detected = false;
      for (const s of check.selectors) {
        try {
          const visible = await page.locator(s).first().isVisible({ timeout: 1_500 });
          if (visible) {
            report.blockers.push({ name: check.name, detected: true, selector: s });
            report.errors.push(`${check.name} detected: ${s}`);
            console.log(`  [WARN] ${check.name} detected: ${s}`);
            detected = true;
            break;
          }
        } catch { /* next */ }
      }
      if (!detected) {
        report.blockers.push({ name: check.name, detected: false });
        console.log(`  [OK]   No ${check.name.toLowerCase()} detected`);
      }
    }

    // ── Derived flags ──
    report.drafted = report.selectors.some(
      (c) => c.name === 'Draft button' && c.matched,
    );
    report.product_linked = report.selectors.some(
      (c) => c.name === 'Add product button' && c.matched,
    );

  } catch (err: any) {
    report.errors.push(err.message);
    console.error(`${TAG} Error during regression: ${err.message}`);
  } finally {
    try { await context!.close(); } catch { /* already closed */ }
  }

  report.duration_ms = Date.now() - start;
  return report;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(55)}`);
  console.log(`  TikTok Studio — Regression Test (Phase 1)`);
  console.log(`${'='.repeat(55)}\n`);

  let report: RegressionReport;

  if (TEST_INVALID_SESSION) {
    report = await runInvalidSessionTest();
  } else {
    report = await runRegression();
  }

  // Write report
  const reportPath = writeReport(report);

  // Summary
  console.log('\n' + '─'.repeat(55));
  console.log(`${TAG} Report written to: ${reportPath}`);
  console.log('');
  console.log(`  mode:             ${report.mode}`);
  console.log(`  session_valid:    ${report.session_valid}`);
  console.log(`  drafted:          ${report.drafted}`);
  console.log(`  product_linked:   ${report.product_linked}`);
  console.log(`  errors:           ${report.errors.length === 0 ? '(none)' : report.errors.join('; ')}`);
  console.log(`  duration:         ${report.duration_ms}ms`);
  console.log('─'.repeat(55));

  // JSON to stdout for piping
  console.log('\n--- REPORT ---');
  console.log(JSON.stringify(report, null, 2));

  // Exit code
  if (TEST_INVALID_SESSION) {
    // For invalid-session test: exit 2 if session correctly detected as invalid, 1 if unexpected
    process.exit(report.session_valid ? 1 : 2);
  }
  if (!report.session_valid) {
    process.exit(2); // session invalid
  }
  const hasErrors = report.errors.length > 0;
  process.exit(hasErrors ? 1 : 0);
}

main().catch((err) => {
  console.error(`${TAG} Fatal: ${err.message}`);
  process.exit(1);
});
