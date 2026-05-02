/**
 * FlashFlow autonomous QA-bot.
 *
 * Drives a headless Chromium through every URL in `config.ts`, captures:
 *   - Full-page screenshots
 *   - HTTP response codes
 *   - Console errors / unhandled exceptions
 *   - Failing fetch/XHR responses (4xx + 5xx)
 *
 * After the run, writes `qa-runs/<timestamp>/SUMMARY.md` with pass/fail per
 * URL + embedded screenshots.
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 *   2 — fatal init error (couldn't launch browser, bad config, etc.)
 *
 * Usage:
 *   npx tsx scripts/qa-bot/run-qa.ts
 *   npx tsx scripts/qa-bot/run-qa.ts --target=https://mc.flashflowai.com
 *   npx tsx scripts/qa-bot/run-qa.ts --target=https://example.com --notify
 *
 * Flags:
 *   --target=<url>   Override base URL (default: production FlashFlow)
 *   --notify         Send Telegram alert on failure (default: off)
 *   --archive        Run the vault archive script after completion
 *   --out=<dir>      Custom output dir (default: ./qa-runs/<ts>)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { parseCliConfig, pathSlug, type QaCheck, type QaConfig } from './config';

// ── Result types ─────────────────────────────────────────────────────────────

interface ConsoleError {
  type: string;
  text: string;
}

interface NetworkFailure {
  url: string;
  status: number;
  statusText: string;
}

interface CheckResult {
  check: QaCheck;
  url: string;
  pass: boolean;
  reason: string;
  status: number | null;
  finalUrl: string | null;
  durationMs: number;
  screenshotFile: string | null;
  consoleErrors: ConsoleError[];
  networkFailures: NetworkFailure[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowTimestamp(): string {
  // 2026-05-02T18-43-12 — sortable + filename-safe
  return new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '');
}

function joinUrl(base: string, p: string): string {
  if (!p || p === '/') return base;
  if (p.startsWith('http')) return p;
  return base.replace(/\/$/, '') + (p.startsWith('/') ? p : '/' + p);
}

function normalizeExpectation(check: QaCheck, status: number, finalUrl: string): { pass: boolean; reason: string } {
  const e = check.expect;
  if (typeof e === 'number') {
    if (status === e) return { pass: true, reason: `status ${status} matches expected ${e}` };
    return { pass: false, reason: `expected status ${e}, got ${status}` };
  }
  switch (e) {
    case '200':
      if (status >= 200 && status < 300) return { pass: true, reason: `2xx: ${status}` };
      return { pass: false, reason: `expected 2xx, got ${status}` };
    case 'auth': {
      // Pass if either (a) page returned 200, OR (b) we ended up on a login page.
      const onLogin = /\/login|\/auth|\/sign[-_]?in/i.test(finalUrl);
      if (onLogin) return { pass: true, reason: `redirected to login (${finalUrl})` };
      if (status >= 200 && status < 300) return { pass: true, reason: `2xx: ${status} (already authed?)` };
      return { pass: false, reason: `auth gate failed: status ${status}, ended at ${finalUrl}` };
    }
    case 'redirect':
      if (status >= 300 && status < 400) return { pass: true, reason: `3xx: ${status}` };
      return { pass: false, reason: `expected 3xx, got ${status}` };
    case 'any-2xx-or-4xx':
      if (status >= 200 && status < 500) return { pass: true, reason: `non-5xx: ${status}` };
      return { pass: false, reason: `5xx: ${status}` };
  }
}

// ── Browser-mode check ───────────────────────────────────────────────────────

async function runBrowserCheck(
  context: BrowserContext,
  check: QaCheck,
  baseUrl: string,
  outDir: string,
  cfg: QaConfig,
): Promise<CheckResult> {
  const url = joinUrl(baseUrl, check.path);
  const page: Page = await context.newPage();
  await page.setViewportSize(cfg.viewport);

  const consoleErrors: ConsoleError[] = [];
  const networkFailures: NetworkFailure[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ type: 'error', text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({ type: 'unhandled', text: err.message });
  });
  page.on('response', (resp: Response) => {
    const status = resp.status();
    if (status >= 400) {
      // Skip the main document — that's tracked as `status` on the result.
      // Only report sub-resource failures.
      if (resp.url() !== url) {
        networkFailures.push({ url: resp.url(), status, statusText: resp.statusText() });
      }
    }
  });

  const start = Date.now();
  let mainStatus: number | null = null;
  let finalUrl: string | null = null;
  let screenshotFile: string | null = null;
  let pass = false;
  let reason = '';

  try {
    const resp = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: cfg.navTimeoutMs,
    });
    mainStatus = resp ? resp.status() : null;
    finalUrl = page.url();

    // Take screenshot if configured (default true for browser checks)
    if (check.screenshot !== false) {
      const slug = pathSlug(check.path);
      screenshotFile = path.join(outDir, `${slug}.png`);
      await page.screenshot({ path: screenshotFile, fullPage: true }).catch((err) => {
        console.warn(`[qa-bot] screenshot failed for ${url}:`, err);
        screenshotFile = null;
      });
    }

    if (mainStatus === null) {
      pass = false;
      reason = 'no response';
    } else {
      const v = normalizeExpectation(check, mainStatus, finalUrl ?? url);
      pass = v.pass;
      reason = v.reason;
    }
  } catch (err) {
    pass = false;
    reason = `nav error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    await page.close().catch(() => {});
  }

  return {
    check,
    url,
    pass,
    reason,
    status: mainStatus,
    finalUrl,
    durationMs: Date.now() - start,
    screenshotFile,
    consoleErrors,
    networkFailures,
  };
}

// ── API-only check ───────────────────────────────────────────────────────────

async function runApiCheck(check: QaCheck, baseUrl: string): Promise<CheckResult> {
  const url = joinUrl(baseUrl, check.path);
  const start = Date.now();
  let status: number | null = null;
  let finalUrl: string | null = url;
  let pass = false;
  let reason = '';

  try {
    const resp = await fetch(url, {
      method: check.method ?? 'GET',
      headers: check.headers,
      body: check.body !== undefined ? JSON.stringify(check.body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    status = resp.status;
    if (resp.headers.get('location')) finalUrl = resp.headers.get('location');
    const v = normalizeExpectation(check, status, finalUrl ?? url);
    pass = v.pass;
    reason = v.reason;
  } catch (err) {
    pass = false;
    reason = `fetch error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    check,
    url,
    pass,
    reason,
    status,
    finalUrl,
    durationMs: Date.now() - start,
    screenshotFile: null,
    consoleErrors: [],
    networkFailures: [],
  };
}

// ── Summary writer ───────────────────────────────────────────────────────────

async function writeSummary(
  outDir: string,
  baseUrl: string,
  results: readonly CheckResult[],
  totalMs: number,
): Promise<string> {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const lines: string[] = [];

  lines.push(`# FlashFlow QA Run`);
  lines.push('');
  lines.push(`- **Target:** ${baseUrl}`);
  lines.push(`- **When:** ${new Date().toISOString()}`);
  lines.push(`- **Host:** ${os.hostname()}`);
  lines.push(`- **Result:** ${failed === 0 ? '**PASS**' : '**FAIL**'} — ${passed}/${results.length} checks passed`);
  lines.push(`- **Duration:** ${(totalMs / 1000).toFixed(1)}s`);
  lines.push('');

  if (failed > 0) {
    lines.push(`## Failures (${failed})`);
    lines.push('');
    for (const r of results.filter((x) => !x.pass)) {
      lines.push(`### FAIL — ${r.check.label ?? r.check.path}`);
      lines.push('');
      lines.push(`- URL: \`${r.url}\``);
      lines.push(`- Status: ${r.status ?? 'n/a'}`);
      lines.push(`- Final URL: \`${r.finalUrl ?? r.url}\``);
      lines.push(`- Reason: ${r.reason}`);
      lines.push(`- Duration: ${r.durationMs}ms`);
      if (r.consoleErrors.length > 0) {
        lines.push(`- Console errors:`);
        for (const e of r.consoleErrors.slice(0, 5)) {
          lines.push(`  - [${e.type}] ${e.text}`);
        }
      }
      if (r.networkFailures.length > 0) {
        lines.push(`- Network failures:`);
        for (const n of r.networkFailures.slice(0, 5)) {
          lines.push(`  - ${n.status} ${n.url}`);
        }
      }
      if (r.screenshotFile) {
        const rel = path.basename(r.screenshotFile);
        lines.push('');
        lines.push(`![${r.check.label ?? r.check.path}](./${rel})`);
      }
      lines.push('');
    }
  }

  lines.push(`## All checks`);
  lines.push('');
  lines.push(`| Status | Label | Path | HTTP | Time | Reason |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const r of results) {
    lines.push(
      `| ${r.pass ? 'PASS' : 'FAIL'} | ${r.check.label ?? '—'} | \`${r.check.path}\` | ${r.status ?? '—'} | ${r.durationMs}ms | ${r.reason} |`,
    );
  }
  lines.push('');

  if (passed > 0) {
    lines.push(`## Screenshots`);
    lines.push('');
    for (const r of results) {
      if (r.screenshotFile) {
        const rel = path.basename(r.screenshotFile);
        lines.push(`### ${r.check.label ?? r.check.path}`);
        lines.push('');
        lines.push(`![${rel}](./${rel})`);
        lines.push('');
      }
    }
  }

  const summaryPath = path.join(outDir, 'SUMMARY.md');
  await fs.writeFile(summaryPath, lines.join('\n'), 'utf8');

  // Also write a machine-readable JSON for automation downstream.
  const json = {
    target: baseUrl,
    timestamp: new Date().toISOString(),
    host: os.hostname(),
    durationMs: totalMs,
    passed,
    failed,
    total: results.length,
    results: results.map((r) => ({
      label: r.check.label,
      path: r.check.path,
      url: r.url,
      pass: r.pass,
      status: r.status,
      finalUrl: r.finalUrl,
      reason: r.reason,
      durationMs: r.durationMs,
      screenshot: r.screenshotFile ? path.basename(r.screenshotFile) : null,
      consoleErrors: r.consoleErrors.length,
      networkFailures: r.networkFailures.length,
    })),
  };
  await fs.writeFile(path.join(outDir, 'result.json'), JSON.stringify(json, null, 2), 'utf8');

  return summaryPath;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(argv: readonly string[]): Promise<number> {
  const cfg = parseCliConfig(argv);

  const wantNotify = argv.includes('--notify');
  const wantArchive = argv.includes('--archive');
  const outArg = argv.find((a) => a.startsWith('--out='));

  const ts = nowTimestamp();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const defaultRoot = path.resolve(here, '..', '..', 'qa-runs', ts);
  const outDir = outArg ? path.resolve(outArg.slice('--out='.length)) : defaultRoot;

  await fs.mkdir(outDir, { recursive: true });

  console.log(`[qa-bot] target=${cfg.baseUrl}`);
  console.log(`[qa-bot] out=${outDir}`);
  console.log(`[qa-bot] checks=${cfg.checks.length}`);

  // Split into browser vs API checks.
  const browserChecks = cfg.checks.filter((c) => !c.apiOnly);
  const apiChecks = cfg.checks.filter((c) => c.apiOnly);

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  const start = Date.now();
  const results: CheckResult[] = [];

  try {
    if (browserChecks.length > 0) {
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({
        viewport: cfg.viewport,
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) FlashFlowQA/1.0 Chrome/120.0.0.0 Safari/537.36',
        ignoreHTTPSErrors: false,
      });
    }

    for (const check of browserChecks) {
      console.log(`[qa-bot] >> ${check.label ?? check.path}`);
      // We just verified browser+context above when browserChecks.length>0.
      const r = await runBrowserCheck(context!, check, cfg.baseUrl, outDir, cfg);
      results.push(r);
      console.log(`[qa-bot]    ${r.pass ? 'PASS' : 'FAIL'} ${r.status ?? '---'} ${r.reason}`);
    }
    for (const check of apiChecks) {
      console.log(`[qa-bot] >> [api] ${check.label ?? check.path}`);
      const r = await runApiCheck(check, cfg.baseUrl);
      results.push(r);
      console.log(`[qa-bot]    ${r.pass ? 'PASS' : 'FAIL'} ${r.status ?? '---'} ${r.reason}`);
    }
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }

  const totalMs = Date.now() - start;
  const summaryPath = await writeSummary(outDir, cfg.baseUrl, results, totalMs);
  console.log(`[qa-bot] summary: ${summaryPath}`);

  const failed = results.filter((r) => !r.pass).length;
  const passed = results.length - failed;

  // Optional Telegram notify on failure.
  if (failed > 0 && wantNotify) {
    await runHelper(path.join(here, 'notify.ts'), [
      `--summary=${summaryPath}`,
      `--target=${cfg.baseUrl}`,
      `--passed=${passed}`,
      `--failed=${failed}`,
    ]).catch((err) => console.error('[qa-bot] notify failed:', err));
  }

  // Optional vault archive.
  if (wantArchive) {
    await runHelper(path.join(here, 'archive.sh'), [outDir], { shell: 'bash' }).catch((err) =>
      console.error('[qa-bot] archive failed:', err),
    );
  }

  console.log(`[qa-bot] done — ${passed}/${results.length} passed in ${(totalMs / 1000).toFixed(1)}s`);
  return failed === 0 ? 0 : 1;
}

interface RunHelperOpts {
  shell?: 'bash' | 'sh';
}
function runHelper(scriptPath: string, args: readonly string[], opts: RunHelperOpts = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const isShell = scriptPath.endsWith('.sh') || opts.shell;
    const cmd = isShell ? (opts.shell ?? 'bash') : 'npx';
    const cmdArgs = isShell ? [scriptPath, ...args] : ['tsx', scriptPath, ...args];
    const child = spawn(cmd, cmdArgs, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

// Entrypoint
main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[qa-bot] FATAL:', err);
    process.exit(2);
  });
