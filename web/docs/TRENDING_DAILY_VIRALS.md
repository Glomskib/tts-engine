# Daily Virals Trending Scraper

Automated Playwright scraper that extracts the top 20 trending products from Daily Virals and posts a structured report to Mission Control.

## Quick Start

```bash
# 1. Bootstrap session (first time, or when session expires after 72h)
npm run trending:daily-virals:bootstrap

# 2. Full run (20 items + screenshots + MC post)
npm run trending:daily-virals

# Dry run (3 mock items, no Playwright, writes outputs + MC doc)
npm run trending:daily-virals -- --dry-run
```

## Session Bootstrap

The scraper **never automates login** — Cloudflare Turnstile blocks automated login attempts. Instead, you manually log in once via a headed browser, and the session is saved for reuse.

```bash
npm run trending:daily-virals:bootstrap
```

This opens a Chromium window and navigates to the Daily Virals site. You:
1. Log in manually (email/password)
2. Complete any Cloudflare challenge
3. Press ENTER in the terminal once you see the trending page

The session is saved to `data/sessions/daily-virals.storageState.json` and is valid for **72 hours**. The automated scraper loads this session on each run — no login needed.

If the session expires or the scraper reports `BLOCKED`, re-run the bootstrap.

## Nightly Cron

The scraper is scheduled to run daily. Two options:

### Option A: Local crontab (recommended for Playwright scraping)

```bash
# Edit crontab
crontab -e

# Run at 6:30 PM PT (01:30 UTC next day) — after trending data refreshes
30 1 * * * cd /Users/brandonglomski/tts-engine/web && /usr/local/bin/npm run trending:daily-virals >> /tmp/daily-virals.log 2>&1
```

### Option B: Vercel cron (mock mode only — no Playwright on serverless)

Already configured in `vercel.json`:

```json
{ "path": "/api/cron/daily-virals", "schedule": "30 13 * * *" }
```

The Vercel route runs in mock mode unless Playwright is available. To trigger a real scrape from Vercel, curl this machine:

```bash
curl -X POST http://localhost:3000/api/cron/daily-virals \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Environment Variables

Add to `web/.env.local`:

```bash
# Required for live scraping
DAILY_VIRALS_TRENDING_URL=https://thedailyvirals.com/trending

# Optional — override the URL opened during bootstrap (defaults to DAILY_VIRALS_TRENDING_URL)
# DAILY_VIRALS_LOGIN_URL=https://thedailyvirals.com/login

# Optional (already set for other pipelines)
MC_API_TOKEN=mc-admin-token-2026
MC_BASE_URL=https://mc.flashflowai.com
CRON_SECRET=your-cron-secret

# Optional — DB persistence
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> **Note:** `DAILY_VIRALS_EMAIL` and `DAILY_VIRALS_PASSWORD` are no longer used. Login is handled manually via `bootstrap-session`.

## Output Files

| File | Description |
|------|-------------|
| `web/data/trending/daily-virals/YYYY-MM-DD/trending.json` | Date-stamped JSON array |
| `web/data/trending/daily-virals/YYYY-MM-DD/trending.csv` | Date-stamped CSV export |
| `web/data/trending/daily-virals/YYYY-MM-DD/screenshots/*.png` | Per-item screenshots |
| `web/data/trending/daily-virals/latest.json` | Copy of most recent run |
| `web/data/trending/daily-virals/latest.csv` | Copy of most recent CSV |
| `web/public/trending.json` | Flattened JSON for frontend "Trending" section |

## Data Schema

Each item in `latest.json`:

```typescript
{
  rank: number;          // 1-20
  title: string;
  product_name: string;
  category: string;
  metrics: {
    views?: string;
    gmv?: string;
    velocity?: string;
    units_sold?: string;
    revenue?: string;
    commission_rate?: string;
    likes?: string;
    shares?: string;
  };
  hook_text: string;
  script_snippet: string;
  source_url: string;
  thumbnail_url: string;
  ai_observation: string;
  captured_at: string;   // ISO 8601
}
```

## Mission Control Output

Posted to MC with:
- **Lane:** FlashFlow
- **Category:** intel
- **Tags:** `trending, daily-virals, YYYY-MM-DD`

The doc includes:
- Summary bullets (count, categories, hooks captured)
- Top 3 "immediate test" picks
- Full top 20 product listing with metrics and links

## Session Persistence

The scraper loads a Playwright `storageState` file (cookies + localStorage) saved by the bootstrap script. The session:

- Is valid for **72 hours** from when it was saved
- Is stored at `data/sessions/daily-virals.storageState.json`
- A meta file (`daily-virals.meta.json`) records the `saved_at` timestamp
- Must be refreshed by re-running `npm run trending:daily-virals:bootstrap`

To force a fresh session:

```bash
rm data/sessions/daily-virals.storageState.json
npm run trending:daily-virals:bootstrap
```

## Data Validation

Scraped items are validated before export. Junk items are automatically filtered:
- Cookie banner text captured as item content
- Fallback titles like "Item 1" with no real data
- Empty items with no title, metrics, hook, or URL

Rejected items are logged with warnings.

## Selectors

All DOM selectors are isolated in:

```
web/scripts/trending/daily-virals/lib/selectors.ts
```

If the site's HTML changes, update only this file. The scraper tries multiple selector candidates per field and falls back gracefully.

## Blocking (Cloudflare / Session Expired)

If the session is missing, expired, or Cloudflare blocks the request:
1. The scraper stops immediately (single attempt, no retries)
2. A `BLOCKED` doc is posted to MC (if MC token is set)
3. A screenshot is saved (if Cloudflare 403)

To unblock:
1. Run `npm run trending:daily-virals:bootstrap`
2. Log in manually in the browser window
3. Press ENTER to save the session
4. Re-run: `npm run trending:daily-virals`

## Dry Run

`--dry-run` mode:
- Generates 3 mock items (no Playwright, no real scraping)
- Writes outputs (trending.json, trending.csv, screenshots/ folder)
- Posts MC doc (summary of mock data)
- Skips DB upsert and screenshot uploads
- Useful for testing the full pipeline without browser automation

## File Structure

```
web/scripts/trending/daily-virals/
├── run.ts                  # CLI entry point (single attempt, no retries)
├── bootstrap-session.ts    # Manual login → saves Playwright storageState
└── lib/
    ├── types.ts            # TypeScript interfaces
    ├── selectors.ts        # DOM selectors (patch here if HTML changes)
    ├── scraper.ts          # Playwright scraper (session-only, no login automation)
    ├── exporter.ts         # JSON/CSV file export
    ├── mc-poster.ts        # Mission Control HTTP client
    ├── db.ts               # Supabase persistence + screenshot upload
    └── public-export.ts    # Public trending.json for frontend

web/app/api/cron/daily-virals/route.ts       # Next.js API cron route
web/data/sessions/daily-virals.storageState.json  # Saved browser session
web/data/trending/daily-virals/              # Output data directory
web/skills/daily-virals-trending/SKILL.md    # OpenClaw skill definition
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "No valid session found" | Run `npm run trending:daily-virals:bootstrap` to log in and save session |
| "Cloudflare blocked (HTTP 403)" | Session expired or invalid. Re-run bootstrap |
| "No trending items found" | Check `screenshots/YYYY-MM-DD/debug-page.html` for raw HTML. Update `selectors.ts` |
| MC post fails | Check `MC_API_TOKEN` is set and MC is running (`mc state`) |
| Selectors broken | Edit `lib/selectors.ts` — each field has multiple fallback selectors |
| Playwright not installed | Run `npx playwright install chromium` |
| "Filtered N junk items" | Selectors are matching wrong elements. Check `debug-page.html` and update `selectors.ts` |
