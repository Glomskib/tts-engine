/**
 * Cron: Daily Virals Trending
 *
 * POST /api/cron/daily-virals
 * Auth: Bearer <CRON_SECRET>
 *
 * Runs the full Daily Virals pipeline:
 *   scrape → export → upload screenshots → upsert DB → post MC → write trending.json
 *
 * If scraper env vars are missing, runs in mock mode (sample data).
 *
 * Suggested schedule: 6:30 AM PT (13:30 UTC) daily
 * vercel.json: "30 13 * * *"
 *
 * Note: Playwright scraping requires a Node.js runtime with browser binaries.
 * On Vercel serverless, this route runs in mock mode unless the scraper env vars
 * are configured and Playwright is available. For full scraping, trigger from
 * a machine with Playwright installed (e.g., via curl POST).
 */
import { NextResponse } from 'next/server';
import { authorizedCron } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — scraping can be slow

export async function POST(request: Request) {
  // 2026-06: normalized to the shared cron-auth helper (see web/lib/cron-auth.ts)
  // — same trimmed CRON_SECRET check + vercel-cron UA fallback as the other
  // crons. Was an untrimmed exact compare, sibling to the 401 incident.
  if (!authorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Dynamic import to avoid loading Playwright at module scope.
    // The pipeline (scrape → screenshot) needs Playwright + browser binaries,
    // which live on the mini, NOT on Vercel serverless. On Vercel the import or
    // the job itself throws (no chromium binary). We catch that below and return
    // 200 "skipped: needs mini" instead of a 500 — a daily 500 here was paging
    // noise and made /api/health look unhealthy. For a real run, POST this
    // endpoint from the mini (which has Playwright) with the CRON_SECRET.
    const { runDailyViralsJob } = await import(
      '@/scripts/trending/daily-virals/run'
    );

    const result = await runDailyViralsJob();

    return NextResponse.json({
      ok: result.ok,
      items: result.itemCount,
      db_upserted: result.dbUpserted,
      mc_posted: result.mcPosted,
      error: result.error ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Playwright/chromium missing on Vercel is EXPECTED — degrade gracefully so
    // the cron is green and only the mini does the real scrape. Heuristic: any
    // browser/playwright launch failure → skipped, not failed.
    const looksLikeMissingBrowser =
      /playwright|chromium|browser|executable|launch|Cannot find module/i.test(message);
    if (looksLikeMissingBrowser) {
      console.warn('[cron/daily-virals] Skipping on Vercel (needs mini):', message);
      return NextResponse.json({
        ok: true,
        skipped: 'needs mini — Playwright/chromium not available on Vercel serverless',
        detail: message,
      });
    }
    console.error('[cron/daily-virals] Fatal:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Also support GET for Vercel cron (Vercel sends GET requests to cron endpoints)
export async function GET(request: Request) {
  return POST(request);
}
