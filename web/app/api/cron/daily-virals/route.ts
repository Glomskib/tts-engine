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

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — scraping can be slow

export async function POST(request: Request) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Dynamic import to avoid loading Playwright at module scope
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
    console.error('[cron/daily-virals] Fatal:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Also support GET for Vercel cron (Vercel sends GET requests to cron endpoints)
export async function GET(request: Request) {
  return POST(request);
}
