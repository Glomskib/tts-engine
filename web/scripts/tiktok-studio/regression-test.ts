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
 * Optionally attaches a video fixture to validate post-upload selectors.
 *
 * Writes a structured JSON report + artifacts to var/run-reports/<timestamp>/.
 *
 * Usage:
 *   npm run tiktok:regression                        # normal run
 *   npm run tiktok:regression:invalid-session         # session-invalid test
 *   HEADLESS=1 npx tsx scripts/tiktok-studio/regression-test.ts
 *   npx tsx scripts/tiktok-studio/regression-test.ts --test-invalid-session
 *
 * Env vars:
 *   HEADLESS=1|0                           — override headless (default: true)
 *   DRY_RUN=1                              — alias: same as running normally
 *   TIKTOK_REGRESSION_VIDEO=/path/to.mp4   — attach video fixture, re-check selectors
 *   TRACE=1                                — enable Playwright tracing
 *   ALLOW_DRAFT_CLICK=1                    — click draft button (only with fixture)
 *
 * Exit codes:
 *   0  = all checks passed
 *   1  = one or more checks failed (see report JSON)
 *   42 = session invalid (aligned with upload-from-pack.ts guardrails)
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

// ─── Exit codes (aligned with upload-from-pack.ts) ──────────────────────────

const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;
const EXIT_SESSION_INVALID = 42;

// ─── CLI flags & env vars ───────────────────────────────────────────────────

const TEST_INVALID_SESSION = process.argv.includes('--test-invalid-session');

// HEADLESS: env > TIKTOK_HEADLESS > default true (CI-friendly)
const HEADLESS =
  process.env.HEADLESS === '0' ? false
    : process.env.HEADLESS === '1' ? true
      : CONFIG.headless || true;

const FIXTURE_PATH = process.env.TIKTOK_REGRESSION_VIDEO || null;
const TRACE_ENABLED = process.env.TRACE === '1';
const ALLOW_DRAFT_CLICK = process.env.ALLOW_DRAFT_CLICK === '1';

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

interface PostAttachResult {
  caption_ok: boolean;
  product_ok: boolean;
  draft_ok: boolean;
  selectors: SelectorCheck[];
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
  exit_code: number;

  // Fixture attach
  used_fixture: boolean;
  fixture_path: string | null;
  attach_detected: boolean;
  attach_reason: string;
  post_attach?: PostAttachResult;
}

// ─── Artifact directory & report writer ─────────────────────────────────────

function createArtifactDir(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(process.cwd(), 'var', 'run-reports', ts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeReport(report: RegressionReport, artifactDir: string): string {
  const filePath = path.join(artifactDir, 'report.json');
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return filePath;
}

// ─── Diagnostics helpers ────────────────────────────────────────────────────

async function captureScreenshot(page: any, artifactDir: string, filename: string): Promise<void> {
  try {
    await page.screenshot({ path: path.join(artifactDir, filename), fullPage: true });
    console.log(`${TAG} Screenshot saved: ${filename}`);
  } catch (err: any) {
    console.warn(`${TAG} Screenshot failed: ${err.message}`);
  }
}

async function captureHtml(page: any, artifactDir: string): Promise<void> {
  try {
    const html = await page.content();
    fs.writeFileSync(path.join(artifactDir, 'page.html'), html);
    console.log(`${TAG} HTML dump saved: page.html`);
  } catch (err: any) {
    console.warn(`${TAG} HTML dump failed: ${err.message}`);
  }
}

// ─── Selector probe helper ──────────────────────────────────────────────────

async function probeSelectors(
  page: any,
  checks: Array<{ name: string; selectors: readonly string[] }>,
  log = true,
): Promise<SelectorCheck[]> {
  const results: SelectorCheck[] = [];
  for (const check of checks) {
    let matched = false;
    for (const s of check.selectors) {
      try {
        const loc = page.locator(s).first();
        const visible = await loc.isVisible({ timeout: 2_000 });
        const attached = !visible ? (await loc.count()) > 0 : true;

        if (visible || attached) {
          const state = visible ? 'visible' : 'attached';
          results.push({ name: check.name, matched: true, selector: s, state });
          if (log) console.log(`  [OK]   ${check.name} — ${s} (${state})`);
          matched = true;
          break;
        }
      } catch { /* next */ }
    }
    if (!matched) {
      results.push({ name: check.name, matched: false, state: 'none' });
      if (log) console.log(`  [MISS] ${check.name} — none of ${check.selectors.length} selectors matched`);
    }
  }
  return results;
}

// ─── Session-invalid test ───────────────────────────────────────────────────

async function runInvalidSessionTest(artifactDir: string): Promise<RegressionReport> {
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
    exit_code: EXIT_SESSION_INVALID,
    used_fixture: false,
    fixture_path: null,
    attach_detected: false,
    attach_reason: 'not attempted',
  };

  try {
    const launchOpts = getLaunchOptions({ headless: HEADLESS });
    const context = await chromium.launchPersistentContext(tmpDir, launchOpts);

    if (TRACE_ENABLED) {
      await context.tracing.start({ screenshots: true, snapshots: true });
    }

    const page = context.pages()[0] || (await context.newPage());

    try {
      await page.goto(CONFIG.uploadUrl, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUTS.navigation,
      });
      await page.waitForTimeout(4_000);

      const url = page.url();
      const onLoginPage =
        url.includes('/login') || url.includes('/auth') || url.includes('/signup');

      if (onLoginPage) {
        report.session_reason = `Redirected to login: ${url}`;
      } else {
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
            report.session_valid = true;
            report.session_reason = 'Unexpectedly appeared logged in with empty profile';
            report.errors.push('Expected session-invalid but page appeared logged in');
            report.exit_code = EXIT_ERROR;
          } else {
            report.session_reason = `Session indeterminate (no login prompts, no upload elements) at ${url}`;
          }
        }
      }

      // Always capture screenshot
      await captureScreenshot(page, artifactDir, 'screenshot.png');

      // Failure diagnostics
      if (!report.session_valid) {
        await captureScreenshot(page, artifactDir, 'screenshot_fail.png');
        await captureHtml(page, artifactDir);
      }
    } finally {
      if (TRACE_ENABLED) {
        try {
          await context.tracing.stop({ path: path.join(artifactDir, 'trace.zip') });
          console.log(`${TAG} Trace saved: trace.zip`);
        } catch (err: any) {
          console.warn(`${TAG} Trace save failed: ${err.message}`);
        }
      }
      await context.close();
    }

    if (!report.session_valid && report.errors.length === 0) {
      console.log(`${TAG} Session correctly detected as invalid: ${report.session_reason}`);
      console.log(`${TAG} PASS: session invalid; run bootstrap`);
    }
  } catch (err: any) {
    report.session_reason = `Browser/network error: ${err.message}`;
    report.errors.push(err.message);
    console.log(`${TAG} Session invalid (error path): ${err.message}`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
  }

  report.duration_ms = Date.now() - start;
  return report;
}

// ─── Normal regression run ──────────────────────────────────────────────────

async function runRegression(artifactDir: string): Promise<RegressionReport> {
  const start = Date.now();
  const profileDir = CONFIG.profileDir;

  // Validate fixture path early
  const useFixture = FIXTURE_PATH !== null;
  if (useFixture && !fs.existsSync(FIXTURE_PATH!)) {
    console.error(`${TAG} TIKTOK_REGRESSION_VIDEO file not found: ${FIXTURE_PATH}`);
    process.exit(EXIT_ERROR);
  }

  console.log(`${TAG} Running regression check...`);
  console.log(`${TAG} Profile:  ${profileDir}`);
  console.log(`${TAG} URL:      ${CONFIG.uploadUrl}`);
  console.log(`${TAG} Headless: ${HEADLESS}`);
  if (useFixture) console.log(`${TAG} Fixture:  ${FIXTURE_PATH}`);
  if (TRACE_ENABLED) console.log(`${TAG} Tracing:  enabled`);
  if (ALLOW_DRAFT_CLICK) console.log(`${TAG} Draft click: enabled`);
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
    exit_code: EXIT_SUCCESS,
    used_fixture: useFixture,
    fixture_path: useFixture ? FIXTURE_PATH : null,
    attach_detected: false,
    attach_reason: useFixture ? 'pending' : 'not attempted',
  };

  // Pre-check: does the profile directory exist?
  if (!fs.existsSync(profileDir)) {
    report.session_reason = `No profile directory at ${profileDir}`;
    report.errors.push('session invalid; run bootstrap');
    report.exit_code = EXIT_SESSION_INVALID;
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
    report.exit_code = EXIT_ERROR;
    report.duration_ms = Date.now() - start;
    return report;
  }

  if (TRACE_ENABLED) {
    await context.tracing.start({ screenshots: true, snapshots: true });
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
      report.exit_code = EXIT_SESSION_INVALID;
      console.error(`${TAG} FAIL: Session expired — redirected to ${url}`);
      return report;
    }

    // Check for NOT-logged-in indicators
    for (const s of sel.LOGIN_INDICATORS) {
      try {
        const visible = await page.locator(s).first().isVisible({ timeout: 2_000 });
        if (visible) {
          report.session_reason = `Login indicator found: ${s}`;
          report.errors.push('session invalid; run bootstrap');
          report.exit_code = EXIT_SESSION_INVALID;
          console.error(`${TAG} FAIL: Login prompt detected (${s})`);
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
    report.selectors = await probeSelectors(page, selectorChecks);

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

    // ── Fixture attach flow ──
    if (useFixture) {
      console.log(`\n${TAG} Attaching video fixture: ${FIXTURE_PATH}`);

      // Find file input from initial selector check
      const fileInputMatch = report.selectors.find(
        (c) => c.name === 'File input' && c.matched,
      );

      if (!fileInputMatch?.selector) {
        report.attach_reason = 'File input selector not found — cannot attach fixture';
        report.errors.push(report.attach_reason);
        console.error(`${TAG} FAIL: ${report.attach_reason}`);
      } else {
        try {
          const fileInput = page.locator(fileInputMatch.selector).first();
          await fileInput.setInputFiles(FIXTURE_PATH!);
          console.log(`${TAG} File input set, waiting for upload processing...`);

          // Wait for attach signals (120s timeout — generous for small fixture)
          const FIXTURE_TIMEOUT = 120_000;
          let attached = false;

          try {
            // Primary signal: caption editor becomes visible
            const captionSelectors = sel.CAPTION_EDITOR.map((s) => s).join(', ');
            await page.locator(captionSelectors).first().waitFor({
              state: 'visible',
              timeout: FIXTURE_TIMEOUT,
            });
            attached = true;
            report.attach_reason = 'Caption editor became visible after attach';
          } catch {
            // Backup: check if file input value changed (some indication of processing)
            try {
              const inputValue = await fileInput.inputValue();
              if (inputValue) {
                attached = true;
                report.attach_reason = 'File input value changed after attach';
              }
            } catch { /* ignore */ }
          }

          if (!attached) {
            report.attach_reason = 'Timed out waiting for attach signals (120s)';
            report.errors.push(report.attach_reason);
            console.error(`${TAG} FAIL: ${report.attach_reason}`);
          } else {
            report.attach_detected = true;
            console.log(`${TAG} Attach detected: ${report.attach_reason}`);

            // Re-check selectors post-attach
            console.log(`\n${TAG} Post-attach selector re-check:`);
            const postAttachChecks: Array<{ name: string; selectors: readonly string[] }> = [
              { name: 'Caption editor', selectors: sel.CAPTION_EDITOR },
              { name: 'Add product button', selectors: sel.ADD_PRODUCT_BTN },
              { name: 'Draft button', selectors: sel.DRAFT_BTN },
            ];

            const postSelectors = await probeSelectors(page, postAttachChecks);

            const postAttach: PostAttachResult = {
              caption_ok: postSelectors.some((c) => c.name === 'Caption editor' && c.matched),
              product_ok: postSelectors.some((c) => c.name === 'Add product button' && c.matched),
              draft_ok: postSelectors.some((c) => c.name === 'Draft button' && c.matched),
              selectors: postSelectors,
            };
            report.post_attach = postAttach;

            // Update derived flags from post-attach
            report.drafted = postAttach.draft_ok;
            report.product_linked = postAttach.product_ok;

            // ── Optional draft click ──
            if (ALLOW_DRAFT_CLICK && postAttach.draft_ok) {
              const draftSelector = postSelectors.find(
                (c) => c.name === 'Draft button' && c.matched,
              )?.selector;

              if (draftSelector) {
                console.log(`${TAG} Clicking draft button: ${draftSelector}`);
                try {
                  await page.locator(draftSelector).first().click();
                  // Wait for success indicator or URL change
                  try {
                    const successSelectors = sel.SUCCESS_INDICATORS.map((s) => s).join(', ');
                    await page.locator(successSelectors).first().waitFor({
                      state: 'visible',
                      timeout: 15_000,
                    });
                    report.drafted = true;
                    console.log(`${TAG} Draft saved successfully`);
                  } catch {
                    // Check for URL change as alternate success signal
                    const postClickUrl = page.url();
                    if (postClickUrl !== url) {
                      report.drafted = true;
                      console.log(`${TAG} Draft click resulted in navigation: ${postClickUrl}`);
                    } else {
                      console.warn(`${TAG} Draft clicked but no success indicator detected`);
                    }
                  }
                } catch (err: any) {
                  report.errors.push(`Draft click failed: ${err.message}`);
                  console.error(`${TAG} Draft click failed: ${err.message}`);
                }
              }
            }
          }
        } catch (err: any) {
          report.attach_reason = `Fixture attach error: ${err.message}`;
          report.errors.push(report.attach_reason);
          console.error(`${TAG} FAIL: ${report.attach_reason}`);
        }
      }
    }

  } catch (err: any) {
    report.errors.push(err.message);
    console.error(`${TAG} Error during regression: ${err.message}`);
  } finally {
    // Always capture screenshot before closing
    if (page) {
      await captureScreenshot(page, artifactDir, 'screenshot.png');

      // On failure: extra diagnostics
      if (!report.session_valid || report.errors.length > 0) {
        await captureScreenshot(page, artifactDir, 'screenshot_fail.png');
        await captureHtml(page, artifactDir);
      }
    }

    if (TRACE_ENABLED && context) {
      try {
        await context.tracing.stop({ path: path.join(artifactDir, 'trace.zip') });
        console.log(`${TAG} Trace saved: trace.zip`);
      } catch (err: any) {
        console.warn(`${TAG} Trace save failed: ${err.message}`);
      }
    }

    try { await context!.close(); } catch { /* already closed */ }
  }

  // Set exit code
  if (!report.session_valid) {
    report.exit_code = EXIT_SESSION_INVALID;
  } else if (report.errors.length > 0) {
    report.exit_code = EXIT_ERROR;
  } else {
    report.exit_code = EXIT_SUCCESS;
  }

  report.duration_ms = Date.now() - start;
  return report;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(55)}`);
  console.log(`  TikTok Studio — Regression Test (Phase 1)`);
  console.log(`${'='.repeat(55)}\n`);

  const artifactDir = createArtifactDir();

  let report: RegressionReport;

  if (TEST_INVALID_SESSION) {
    report = await runInvalidSessionTest(artifactDir);
  } else {
    report = await runRegression(artifactDir);
  }

  // Write report
  const reportPath = writeReport(report, artifactDir);

  // Summary
  console.log('\n' + '─'.repeat(55));
  console.log(`${TAG} Artifacts: ${artifactDir}`);
  console.log(`${TAG} Report:    ${reportPath}`);
  console.log('');
  console.log(`  mode:             ${report.mode}`);
  console.log(`  session_valid:    ${report.session_valid}`);
  console.log(`  drafted:          ${report.drafted}`);
  console.log(`  product_linked:   ${report.product_linked}`);
  if (report.used_fixture) {
    console.log(`  used_fixture:     ${report.used_fixture}`);
    console.log(`  attach_detected:  ${report.attach_detected}`);
    console.log(`  attach_reason:    ${report.attach_reason}`);
    if (report.post_attach) {
      console.log(`  post_attach:      caption=${report.post_attach.caption_ok} product=${report.post_attach.product_ok} draft=${report.post_attach.draft_ok}`);
    }
  }
  console.log(`  errors:           ${report.errors.length === 0 ? '(none)' : report.errors.join('; ')}`);
  console.log(`  exit_code:        ${report.exit_code}`);
  console.log(`  duration:         ${report.duration_ms}ms`);
  console.log('─'.repeat(55));

  // JSON to stdout for piping
  console.log('\n--- REPORT ---');
  console.log(JSON.stringify(report, null, 2));

  // Exit code
  if (TEST_INVALID_SESSION) {
    // Session correctly invalid → 42; unexpectedly logged in → 1
    process.exit(report.session_valid ? EXIT_ERROR : EXIT_SESSION_INVALID);
  }
  process.exit(report.exit_code);
}

main().catch((err) => {
  console.error(`${TAG} Fatal: ${err.message}`);
  process.exit(EXIT_ERROR);
});
