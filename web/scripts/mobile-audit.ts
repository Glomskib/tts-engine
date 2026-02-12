#!/usr/bin/env npx tsx
/**
 * Mobile UI Audit — Full Site Screenshot Crawl + Issue Report
 *
 * Takes full-page screenshots of every FlashFlow page at mobile viewports
 * and produces a detailed markdown report of layout issues.
 *
 * Usage: cd web && npx tsx scripts/mobile-audit.ts
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://qqyrwwvtxzrwbyqegpme.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeXJ3d3Z0eHpyd2J5cWVncG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3ODAyNDIsImV4cCI6MjA4NDM1NjI0Mn0.gEsqqcVb6eJBRDkIAAIPdkaGTgxXh9AvhrLciK8qbuE';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeXJ3d3Z0eHpyd2J5cWVncG1lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODc4MDI0MiwiZXhwIjoyMDg0MzU2MjQyfQ.kV8aS-K0W49heqLgxvKUroXx6OVvX7jMgEFyPzdPh3k';
const ADMIN_EMAIL = 'brandon@communitycorewholesale.com';

const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'screenshots', 'mobile-audit');

const VIEWPORTS = [
  { label: '375x812', width: 375, height: 812 },
  { label: '390x844', width: 390, height: 844 },
] as const;

const NAV_TIMEOUT = 30_000;
const HYDRATION_WAIT = 2_000;

// Cookie chunk size used by @supabase/ssr
const COOKIE_CHUNK_SIZE = 3180;

// ─── Page definitions ────────────────────────────────────────────────────────

interface PageDef {
  path: string;
  section: string;
  auth: 'none' | 'user' | 'admin';
}

const PAGES: PageDef[] = [
  // ── Public ──
  { path: '/', section: 'public', auth: 'none' },
  { path: '/pricing', section: 'public', auth: 'none' },
  { path: '/blog', section: 'public', auth: 'none' },
  { path: '/creators', section: 'public', auth: 'none' },
  { path: '/brands', section: 'public', auth: 'none' },
  { path: '/agencies', section: 'public', auth: 'none' },
  { path: '/examples', section: 'public', auth: 'none' },
  { path: '/free-scripts', section: 'public', auth: 'none' },
  { path: '/login', section: 'public', auth: 'none' },
  { path: '/forgot-password', section: 'public', auth: 'none' },
  { path: '/privacy', section: 'public', auth: 'none' },
  { path: '/terms', section: 'public', auth: 'none' },
  { path: '/signup', section: 'public', auth: 'none' },
  { path: '/reset-password', section: 'public', auth: 'none' },
  { path: '/offline', section: 'public', auth: 'none' },

  // ── Dashboard / Core ──
  { path: '/concepts', section: 'dashboard', auth: 'user' },
  { path: '/winners', section: 'dashboard', auth: 'user' },
  { path: '/videos', section: 'dashboard', auth: 'user' },
  { path: '/accounts', section: 'dashboard', auth: 'user' },
  { path: '/upgrade', section: 'dashboard', auth: 'user' },

  // ── VA / Uploader ──
  { path: '/va', section: 'va', auth: 'user' },
  { path: '/va/help', section: 'va', auth: 'user' },
  { path: '/uploader', section: 'uploader', auth: 'user' },

  // ── Client portal ──
  { path: '/client', section: 'client', auth: 'user' },
  { path: '/client/analytics', section: 'client', auth: 'user' },
  { path: '/client/billing', section: 'client', auth: 'user' },
  { path: '/client/my-videos', section: 'client', auth: 'user' },
  { path: '/client/projects', section: 'client', auth: 'user' },
  { path: '/client/requests', section: 'client', auth: 'user' },
  { path: '/client/requests/new', section: 'client', auth: 'user' },
  { path: '/client/review', section: 'client', auth: 'user' },
  { path: '/client/support', section: 'client', auth: 'user' },
  { path: '/client/videos', section: 'client', auth: 'user' },

  // ── Admin ──
  { path: '/admin', section: 'admin', auth: 'admin' },
  { path: '/admin/dashboard', section: 'admin', auth: 'admin' },
  { path: '/admin/users', section: 'admin', auth: 'admin' },
  { path: '/admin/affiliates', section: 'admin', auth: 'admin' },
  { path: '/admin/analytics', section: 'admin', auth: 'admin' },
  { path: '/admin/analytics/daily', section: 'admin', auth: 'admin' },
  { path: '/admin/analytics/upload', section: 'admin', auth: 'admin' },
  { path: '/admin/audience', section: 'admin', auth: 'admin' },
  { path: '/admin/audit-log', section: 'admin', auth: 'admin' },
  { path: '/admin/events', section: 'admin', auth: 'admin' },
  { path: '/admin/ops', section: 'admin', auth: 'admin' },
  { path: '/admin/settings', section: 'admin', auth: 'admin' },
  { path: '/admin/settings/diagnostics', section: 'admin', auth: 'admin' },
  { path: '/admin/settings/telegram', section: 'admin', auth: 'admin' },
  { path: '/admin/system-health', section: 'admin', auth: 'admin' },
  { path: '/admin/ab-tests', section: 'admin', auth: 'admin' },
  { path: '/admin/accounts', section: 'admin', auth: 'admin' },
  { path: '/admin/activity', section: 'admin', auth: 'admin' },
  { path: '/admin/api-docs', section: 'admin', auth: 'admin' },
  { path: '/admin/assignments', section: 'admin', auth: 'admin' },
  { path: '/admin/automation', section: 'admin', auth: 'admin' },
  { path: '/admin/billing', section: 'admin', auth: 'admin' },
  { path: '/admin/brands', section: 'admin', auth: 'admin' },
  { path: '/admin/calendar', section: 'admin', auth: 'admin' },
  { path: '/admin/client-management', section: 'admin', auth: 'admin' },
  { path: '/admin/client-orgs', section: 'admin', auth: 'admin' },
  { path: '/admin/clients', section: 'admin', auth: 'admin' },
  { path: '/admin/collections', section: 'admin', auth: 'admin' },
  { path: '/admin/compare', section: 'admin', auth: 'admin' },
  { path: '/admin/competitors', section: 'admin', auth: 'admin' },
  { path: '/admin/content-package', section: 'admin', auth: 'admin' },
  { path: '/admin/content-studio', section: 'admin', auth: 'admin' },
  { path: '/admin/credits', section: 'admin', auth: 'admin' },
  { path: '/admin/data-audit', section: 'admin', auth: 'admin' },
  { path: '/admin/demographics', section: 'admin', auth: 'admin' },
  { path: '/admin/editor', section: 'admin', auth: 'admin' },
  { path: '/admin/execution', section: 'admin', auth: 'admin' },
  { path: '/admin/guide', section: 'admin', auth: 'admin' },
  { path: '/admin/help', section: 'admin', auth: 'admin' },
  { path: '/admin/hook-suggestions', section: 'admin', auth: 'admin' },
  { path: '/admin/ingestion', section: 'admin', auth: 'admin' },
  { path: '/admin/integrations', section: 'admin', auth: 'admin' },
  { path: '/admin/monitoring', section: 'admin', auth: 'admin' },
  { path: '/admin/notifications', section: 'admin', auth: 'admin' },
  { path: '/admin/onboarding', section: 'admin', auth: 'admin' },
  { path: '/admin/performance', section: 'admin', auth: 'admin' },
  { path: '/admin/pipeline', section: 'admin', auth: 'admin' },
  { path: '/admin/posting-queue', section: 'admin', auth: 'admin' },
  { path: '/admin/products', section: 'admin', auth: 'admin' },
  { path: '/admin/promo-codes', section: 'admin', auth: 'admin' },
  { path: '/admin/quality', section: 'admin', auth: 'admin' },
  { path: '/admin/quick', section: 'admin', auth: 'admin' },
  { path: '/admin/recorder', section: 'admin', auth: 'admin' },
  { path: '/admin/referrals', section: 'admin', auth: 'admin' },
  { path: '/admin/requests', section: 'admin', auth: 'admin' },
  { path: '/admin/revenue', section: 'admin', auth: 'admin' },
  { path: '/admin/script-of-the-day', section: 'admin', auth: 'admin' },
  { path: '/admin/scripts', section: 'admin', auth: 'admin' },
  { path: '/admin/second-brain', section: 'admin', auth: 'admin' },
  { path: '/admin/skit-generator', section: 'admin', auth: 'admin' },
  { path: '/admin/skit-library', section: 'admin', auth: 'admin' },
  { path: '/admin/status', section: 'admin', auth: 'admin' },
  { path: '/admin/submit-video', section: 'admin', auth: 'admin' },
  { path: '/admin/templates', section: 'admin', auth: 'admin' },
  { path: '/admin/test-center', section: 'admin', auth: 'admin' },
  { path: '/admin/trends', section: 'admin', auth: 'admin' },
  { path: '/admin/upgrade-requests', section: 'admin', auth: 'admin' },
  { path: '/admin/upload', section: 'admin', auth: 'admin' },
  { path: '/admin/uploader', section: 'admin', auth: 'admin' },
  { path: '/admin/usage', section: 'admin', auth: 'admin' },
  { path: '/admin/va-scorecard', section: 'admin', auth: 'admin' },
  { path: '/admin/video-editing', section: 'admin', auth: 'admin' },
  { path: '/admin/videos', section: 'admin', auth: 'admin' },
  { path: '/admin/voice', section: 'admin', auth: 'admin' },
  { path: '/admin/winners', section: 'admin', auth: 'admin' },
  { path: '/admin/winners-bank', section: 'admin', auth: 'admin' },
  { path: '/admin/winners/patterns', section: 'admin', auth: 'admin' },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface PageMetrics {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  hasHorizontalOverflow: boolean;
  smallTextCount: number;
  smallTouchTargets: number;
  imagesOverflowing: number;
}

interface PageResult {
  pageDef: PageDef;
  viewport: string;
  screenshotFile: string;
  status: 'success' | 'error' | 'skipped' | 'redirected';
  finalUrl?: string;
  consoleErrors: string[];
  networkErrors: string[];
  metrics?: PageMetrics;
  error?: string;
  loadTimeMs?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(pagePath: string): string {
  return pagePath
    .replace(/^\//, '')
    .replace(/\//g, '_')
    .replace(/[^a-z0-9_-]/gi, '') || 'home';
}

function screenshotName(section: string, pagePath: string, viewport: string): string {
  return `${section}_${slugify(pagePath)}_${viewport}.png`;
}

/** Determine which base URL to use */
async function resolveBaseUrl(): Promise<string> {
  // Try prod domain first
  try {
    const r = await fetch('https://flashflowai.com', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (r.ok) return 'https://flashflowai.com';
  } catch { /* ignore */ }

  // Try localhost dev server
  try {
    const r = await fetch('http://localhost:3000', { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    if (r.ok) return 'http://localhost:3000';
  } catch { /* ignore */ }

  console.error('ERROR: Neither flashflowai.com nor localhost:3000 is reachable.');
  console.error('Start the dev server with: npm run dev');
  process.exit(1);
}

/** Get an authenticated session using Supabase Admin API */
async function getAuthSession(): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Generate a magic link (admin API, no password needed)
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: ADMIN_EMAIL,
    });

    if (linkError || !linkData) {
      console.error('Failed to generate magic link:', linkError?.message);
      return null;
    }

    const hashedToken = linkData.properties?.hashed_token;
    if (!hashedToken) {
      console.error('No hashed_token in magic link response');
      return null;
    }

    // Exchange the hashed token for a real session
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'magiclink',
    });

    if (verifyError || !verifyData.session) {
      console.error('Failed to verify OTP:', verifyError?.message);
      return null;
    }

    console.log(`  Authenticated as: ${verifyData.session.user.email}`);
    return {
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
    };
  } catch (err) {
    console.error('Auth error:', err);
    return null;
  }
}

/** Set Supabase auth cookies in the browser context */
async function injectAuthCookies(
  context: BrowserContext,
  session: { access_token: string; refresh_token: string },
  baseUrl: string,
): Promise<void> {
  const sessionJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });

  const domain = new URL(baseUrl).hostname;
  const cookieBase = 'sb-qqyrwwvtxzrwbyqegpme-auth-token';
  const expiry = Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60;

  if (sessionJson.length <= COOKIE_CHUNK_SIZE) {
    await context.addCookies([{
      name: cookieBase,
      value: sessionJson,
      domain,
      path: '/',
      sameSite: 'Lax' as const,
      httpOnly: false,
      expires: expiry,
    }]);
  } else {
    // Chunk the cookie (same logic as @supabase/ssr)
    const chunks: string[] = [];
    for (let i = 0; i < sessionJson.length; i += COOKIE_CHUNK_SIZE) {
      chunks.push(sessionJson.slice(i, i + COOKIE_CHUNK_SIZE));
    }
    const cookies = chunks.map((chunk, i) => ({
      name: `${cookieBase}.${i}`,
      value: chunk,
      domain,
      path: '/',
      sameSite: 'Lax' as const,
      httpOnly: false,
      expires: expiry,
    }));
    await context.addCookies(cookies);
  }
}

/** Collect layout metrics from the page */
async function collectMetrics(page: Page): Promise<PageMetrics> {
  return page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;

    // Horizontal overflow
    const scrollWidth = Math.max(html.scrollWidth, body.scrollWidth);
    const clientWidth = html.clientWidth;

    // Count text elements smaller than 14px
    let smallTextCount = 0;
    const textEls = document.querySelectorAll('p, span, a, li, td, th, label, h1, h2, h3, h4, h5, h6, div, button');
    textEls.forEach(el => {
      const style = window.getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize);
      if (fontSize > 0 && fontSize < 14 && el.textContent && el.textContent.trim().length > 0) {
        smallTextCount++;
      }
    });

    // Count touch targets smaller than 44x44
    let smallTouchTargets = 0;
    const interactiveEls = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [tabindex]');
    interactiveEls.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
        smallTouchTargets++;
      }
    });

    // Count overflowing images
    let imagesOverflowing = 0;
    document.querySelectorAll('img, video, svg, canvas').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > clientWidth + 2) {
        imagesOverflowing++;
      }
    });

    return {
      scrollWidth,
      clientWidth,
      scrollHeight: Math.max(html.scrollHeight, body.scrollHeight),
      clientHeight: html.clientHeight,
      hasHorizontalOverflow: scrollWidth > clientWidth + 2,
      smallTextCount,
      smallTouchTargets,
      imagesOverflowing,
    };
  });
}

/** Crawl a single page at a single viewport */
async function crawlPage(
  context: BrowserContext,
  pageDef: PageDef,
  viewport: (typeof VIEWPORTS)[number],
  baseUrl: string,
  hasAuth: boolean,
): Promise<PageResult> {
  const fname = screenshotName(pageDef.section, pageDef.path, viewport.label);
  const screenshotPath = path.join(SCREENSHOT_DIR, fname);

  // Skip auth-required pages if we don't have auth
  if (pageDef.auth !== 'none' && !hasAuth) {
    return {
      pageDef,
      viewport: viewport.label,
      screenshotFile: fname,
      status: 'skipped',
      consoleErrors: [],
      networkErrors: [],
      error: 'SKIPPED — auth required',
    };
  }

  const page = await context.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', req => {
    networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });

  const url = `${baseUrl}${pageDef.path}`;
  const start = Date.now();

  try {
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: NAV_TIMEOUT,
    });

    // Wait for hydration
    await page.waitForTimeout(HYDRATION_WAIT);

    const finalUrl = page.url();
    const wasRedirected = !finalUrl.includes(pageDef.path) && pageDef.path !== '/';

    // Check if redirected to login (auth failed)
    if (wasRedirected && finalUrl.includes('/login')) {
      await page.close();
      return {
        pageDef,
        viewport: viewport.label,
        screenshotFile: fname,
        status: 'redirected',
        finalUrl,
        consoleErrors,
        networkErrors,
        error: 'Redirected to /login — session may have expired',
        loadTimeMs: Date.now() - start,
      };
    }

    // Take full-page screenshot
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Collect metrics
    const metrics = await collectMetrics(page);

    await page.close();
    return {
      pageDef,
      viewport: viewport.label,
      screenshotFile: fname,
      status: wasRedirected ? 'redirected' : 'success',
      finalUrl: wasRedirected ? finalUrl : undefined,
      consoleErrors,
      networkErrors,
      metrics,
      loadTimeMs: Date.now() - start,
    };
  } catch (err: any) {
    // Still try to take a screenshot if possible
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch { /* ignore */ }

    await page.close();
    return {
      pageDef,
      viewport: viewport.label,
      screenshotFile: fname,
      status: 'error',
      consoleErrors,
      networkErrors,
      error: err.message,
      loadTimeMs: Date.now() - start,
    };
  }
}

// ─── Report generation ───────────────────────────────────────────────────────

function severityEmoji(result: PageResult): string {
  if (result.status === 'error' || result.status === 'skipped') return '⏭️';
  if (result.status === 'redirected') return '↩️';
  if (!result.metrics) return '❓';

  const m = result.metrics;
  const critical = m.hasHorizontalOverflow || m.imagesOverflowing > 0;
  const minor = m.smallTextCount > 5 || m.smallTouchTargets > 3;

  if (critical) return '🔴';
  if (minor) return '🟡';
  return '🟢';
}

function severityLabel(result: PageResult): string {
  if (result.status === 'error') return 'Error';
  if (result.status === 'skipped') return 'Skipped';
  if (result.status === 'redirected') return 'Redirected';
  if (!result.metrics) return 'Unknown';

  const m = result.metrics;
  if (m.hasHorizontalOverflow || m.imagesOverflowing > 0) return 'Critical';
  if (m.smallTextCount > 5 || m.smallTouchTargets > 3) return 'Minor';
  return 'Good';
}

function generateReport(results: PageResult[], baseUrl: string): string {
  const date = new Date().toISOString().split('T')[0];

  // Group by section then by page path
  const bySection = new Map<string, Map<string, PageResult[]>>();
  for (const r of results) {
    if (!bySection.has(r.pageDef.section)) bySection.set(r.pageDef.section, new Map());
    const section = bySection.get(r.pageDef.section)!;
    if (!section.has(r.pageDef.path)) section.set(r.pageDef.path, []);
    section.get(r.pageDef.path)!.push(r);
  }

  // Stats
  const uniquePages = new Set(results.map(r => r.pageDef.path)).size;
  const pagesWithIssues = new Set(
    results
      .filter(r => r.metrics && (r.metrics.hasHorizontalOverflow || r.metrics.imagesOverflowing > 0 || r.metrics.smallTextCount > 5 || r.metrics.smallTouchTargets > 3))
      .map(r => r.pageDef.path)
  ).size;
  const criticalPages = new Set(
    results
      .filter(r => r.metrics && (r.metrics.hasHorizontalOverflow || r.metrics.imagesOverflowing > 0))
      .map(r => r.pageDef.path)
  ).size;
  const minorPages = pagesWithIssues - criticalPages;

  let md = `# FlashFlow Mobile UI Audit Report\n\n`;
  md += `Generated: ${date}\n`;
  md += `Base URL: ${baseUrl}\n`;
  md += `Viewports tested: 375×812 (iPhone SE), 390×844 (iPhone 14 Pro)\n\n`;

  md += `## Summary\n\n`;
  md += `- Total pages tested: ${uniquePages}\n`;
  md += `- Pages with issues: ${pagesWithIssues}\n`;
  md += `- Critical issues (broken layout): ${criticalPages}\n`;
  md += `- Minor issues (polish needed): ${minorPages}\n`;
  md += `- Pages skipped: ${results.filter(r => r.status === 'skipped').length / 2}\n`;
  md += `- Pages redirected: ${new Set(results.filter(r => r.status === 'redirected').map(r => r.pageDef.path)).size}\n\n`;

  const sectionOrder = ['public', 'dashboard', 'va', 'uploader', 'client', 'admin'];
  const sectionLabels: Record<string, string> = {
    public: 'Public Pages',
    dashboard: 'Dashboard Pages',
    va: 'VA Portal',
    uploader: 'Uploader Portal',
    client: 'Client Portal',
    admin: 'Admin Pages',
  };

  for (const sectionKey of sectionOrder) {
    const pages = bySection.get(sectionKey);
    if (!pages) continue;

    md += `## ${sectionLabels[sectionKey] || sectionKey}\n\n`;

    for (const [pagePath, pageResults] of pages) {
      const worst = pageResults.reduce((a, b) => {
        const aScore = severityLabel(a) === 'Critical' ? 3 : severityLabel(a) === 'Minor' ? 2 : 1;
        const bScore = severityLabel(b) === 'Critical' ? 3 : severityLabel(b) === 'Minor' ? 2 : 1;
        return bScore > aScore ? b : a;
      });

      md += `### ${pagePath}\n\n`;
      md += `**Status:** ${severityEmoji(worst)} ${severityLabel(worst)}\n`;
      md += `**Screenshots:** ${pageResults.map(r => r.screenshotFile).join(', ')}\n\n`;

      if (worst.status === 'skipped') {
        md += `> SKIPPED — auth required\n\n`;
        continue;
      }
      if (worst.status === 'redirected') {
        md += `> Redirected to: ${worst.finalUrl}\n\n`;
        continue;
      }
      if (worst.status === 'error') {
        md += `> Error: ${worst.error}\n\n`;
        continue;
      }

      const issues: string[] = [];

      for (const r of pageResults) {
        if (!r.metrics) continue;
        const m = r.metrics;
        const vp = r.viewport;

        if (m.hasHorizontalOverflow) {
          issues.push(`[Critical] **Horizontal overflow** at ${vp} — scrollWidth ${m.scrollWidth}px vs clientWidth ${m.clientWidth}px (${m.scrollWidth - m.clientWidth}px overflow)`);
        }
        if (m.imagesOverflowing > 0) {
          issues.push(`[Critical] **${m.imagesOverflowing} image(s)/media overflowing** viewport at ${vp}`);
        }
        if (m.smallTouchTargets > 3) {
          issues.push(`[Minor] **${m.smallTouchTargets} touch targets < 44×44px** at ${vp}`);
        }
        if (m.smallTextCount > 5) {
          issues.push(`[Minor] **${m.smallTextCount} text elements < 14px** at ${vp}`);
        }
        if (r.consoleErrors.length > 0) {
          issues.push(`[Info] ${r.consoleErrors.length} console error(s) at ${vp}: ${r.consoleErrors.slice(0, 3).join('; ')}`);
        }
        if (r.networkErrors.length > 0) {
          issues.push(`[Info] ${r.networkErrors.length} network error(s) at ${vp}`);
        }
      }

      if (issues.length === 0) {
        md += `No automated issues detected.\n\n`;
      } else {
        md += `**Issues:**\n\n`;
        for (const issue of [...new Set(issues)]) {
          md += `- ${issue}\n`;
        }
        md += '\n';
      }
    }
  }

  // Priority fix list
  md += `## Priority Fix List\n\n`;
  const allIssuePages: Array<{ path: string; severity: string; detail: string }> = [];

  for (const r of results) {
    if (!r.metrics) continue;
    const m = r.metrics;
    if (m.hasHorizontalOverflow) {
      allIssuePages.push({ path: r.pageDef.path, severity: 'Critical', detail: `Horizontal overflow (${m.scrollWidth - m.clientWidth}px) at ${r.viewport}` });
    }
    if (m.imagesOverflowing > 0) {
      allIssuePages.push({ path: r.pageDef.path, severity: 'Critical', detail: `${m.imagesOverflowing} overflowing images at ${r.viewport}` });
    }
    if (m.smallTouchTargets > 3) {
      allIssuePages.push({ path: r.pageDef.path, severity: 'Minor', detail: `${m.smallTouchTargets} small touch targets at ${r.viewport}` });
    }
    if (m.smallTextCount > 5) {
      allIssuePages.push({ path: r.pageDef.path, severity: 'Minor', detail: `${m.smallTextCount} small text elements at ${r.viewport}` });
    }
  }

  // Deduplicate and sort (Critical first)
  const seen = new Set<string>();
  const sortedIssues = allIssuePages
    .sort((a, b) => (a.severity === 'Critical' ? 0 : 1) - (b.severity === 'Critical' ? 0 : 1))
    .filter(i => {
      const key = `${i.path}-${i.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (sortedIssues.length === 0) {
    md += `No automated issues detected across all pages.\n\n`;
  } else {
    for (let i = 0; i < sortedIssues.length; i++) {
      const issue = sortedIssues[i];
      md += `${i + 1}. [${issue.severity}] **${issue.path}** — ${issue.detail}\n`;
    }
    md += '\n';
  }

  md += `---\n\n`;
  md += `> Note: This report uses automated detection (horizontal overflow, font sizes, touch target sizes, media overflow). `;
  md += `Visual issues like navigation collapse, modal fit, form layout, and spacing require manual review of the screenshots.\n`;

  return md;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== FlashFlow Mobile UI Audit ===\n');

  // 1. Resolve base URL
  console.log('1. Resolving base URL...');
  const baseUrl = await resolveBaseUrl();
  console.log(`   Using: ${baseUrl}\n`);

  // 2. Set up auth
  console.log('2. Setting up authentication...');
  const session = await getAuthSession();
  if (session) {
    console.log('   Auth session obtained.\n');
  } else {
    console.log('   WARNING: No auth session. Authenticated pages will be skipped.\n');
  }

  // 3. Ensure screenshot directory exists
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // 4. Launch browser
  console.log('3. Launching browser...\n');
  const browser = await chromium.launch({ headless: true });
  const results: PageResult[] = [];

  try {
    for (const viewport of VIEWPORTS) {
      console.log(`── Viewport: ${viewport.label} ──\n`);

      // Create a context per viewport with auth cookies
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      });

      if (session) {
        await injectAuthCookies(context, session, baseUrl);
      }

      for (const pageDef of PAGES) {
        const slug = pageDef.path || '/';
        process.stdout.write(`  ${viewport.label} ${slug} ... `);

        const result = await crawlPage(context, pageDef, viewport, baseUrl, !!session);
        results.push(result);

        const emoji = severityEmoji(result);
        const time = result.loadTimeMs ? `${(result.loadTimeMs / 1000).toFixed(1)}s` : '-';
        console.log(`${emoji} ${result.status} (${time})`);
      }

      await context.close();
      console.log('');
    }
  } finally {
    await browser.close();
  }

  // 5. Generate report
  console.log('4. Generating report...\n');
  const report = generateReport(results, baseUrl);
  const reportPath = path.join(SCREENSHOT_DIR, 'MOBILE_AUDIT_REPORT.md');
  fs.writeFileSync(reportPath, report);
  console.log(`   Report saved: ${reportPath}\n`);

  // 6. Print summary
  const uniquePages = new Set(results.map(r => r.pageDef.path)).size;
  const issuePages = new Set(
    results.filter(r => r.metrics && (r.metrics.hasHorizontalOverflow || r.metrics.imagesOverflowing > 0 || r.metrics.smallTextCount > 5 || r.metrics.smallTouchTargets > 3))
      .map(r => r.pageDef.path)
  ).size;

  console.log('=== Summary ===');
  console.log(`Total pages tested: ${uniquePages}`);
  console.log(`Pages with issues: ${issuePages}`);
  console.log(`Screenshots saved: ${results.filter(r => r.status === 'success').length}`);
  console.log(`Skipped: ${results.filter(r => r.status === 'skipped').length}`);

  // Top 5 worst pages
  const pageScores = new Map<string, number>();
  for (const r of results) {
    if (!r.metrics) continue;
    const m = r.metrics;
    let score = 0;
    if (m.hasHorizontalOverflow) score += 10;
    if (m.imagesOverflowing > 0) score += 5 * m.imagesOverflowing;
    if (m.smallTouchTargets > 3) score += m.smallTouchTargets;
    if (m.smallTextCount > 5) score += Math.floor(m.smallTextCount / 2);
    const prev = pageScores.get(r.pageDef.path) || 0;
    pageScores.set(r.pageDef.path, prev + score);
  }

  const top5 = [...pageScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .filter(([_, score]) => score > 0);

  if (top5.length > 0) {
    console.log('\nTop 5 worst pages:');
    for (const [pagePath, score] of top5) {
      console.log(`  ${score.toString().padStart(3)} pts  ${pagePath}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
