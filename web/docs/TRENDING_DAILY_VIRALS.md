# Daily Virals Trending Scraper

Automated Playwright scraper that logs into Daily Virals, extracts the top 20 trending products, and posts a structured report to Mission Control.

## Quick Start

```bash
# Full run (20 items + screenshots + MC post)
npm run trending:daily-virals

# Dry run (3 mock items, no Playwright, writes outputs + MC doc)
npm run trending:daily-virals -- --dry-run
```

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
DAILY_VIRALS_EMAIL=your@email.com
DAILY_VIRALS_PASSWORD=your-password
DAILY_VIRALS_TRENDING_URL=https://thedailyvirals.com/trending

# Optional (already set for other pipelines)
MC_API_TOKEN=mc-admin-token-2026
MC_BASE_URL=http://127.0.0.1:3100
CRON_SECRET=your-cron-secret

# Optional — DB persistence
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

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

The scraper saves browser cookies/localStorage to `.session-state.json` after each successful login. On the next run it loads the saved session, which:

- Avoids re-login if the session is still valid (< 24 hours old)
- Reduces bot-detection risk from repeated login flows
- Falls back to fresh login if the session is expired or missing

Session file: `web/data/trending/daily-virals/.session-state.json`

To force a fresh login, delete the session file:

```bash
rm web/data/trending/daily-virals/.session-state.json
```

## Retry Logic

If the scraper extracts zero items (but isn't blocked), it retries up to 2 more times with increasing delays (10s, 20s). Blocking (2FA/CAPTCHA) is not retried — it requires manual intervention.

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

## Blocking (2FA / CAPTCHA)

If login fails due to 2FA or CAPTCHA:
1. The scraper stops immediately
2. A `BLOCKED` doc is posted to MC (tags: `blocked, needs-input, daily-virals`)
3. A screenshot is saved to `screenshots/blocked.png`

To unblock:
1. Log in manually and complete the challenge
2. Update credentials if needed
3. Re-run: `npm run trending:daily-virals -- --dry-run`

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
├── run.ts              # CLI entry point + retry logic
└── lib/
    ├── types.ts        # TypeScript interfaces
    ├── selectors.ts    # DOM selectors (patch here if HTML changes)
    ├── scraper.ts      # Playwright browser automation + session persistence
    ├── exporter.ts     # JSON/CSV file export
    ├── mc-poster.ts    # Mission Control HTTP client
    ├── db.ts           # Supabase persistence + screenshot upload
    └── public-export.ts # Public trending.json for frontend

web/app/api/cron/daily-virals/route.ts   # Next.js API cron route
web/data/trending/daily-virals/          # Output data directory
web/skills/daily-virals-trending/SKILL.md # OpenClaw skill definition
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Missing required env vars" | Add `DAILY_VIRALS_*` vars to `web/.env.local` |
| "No trending items found" | Check `screenshots/YYYY-MM-DD/debug-page.html` for raw HTML. Update `selectors.ts` |
| "Login blocked by 2FA" | Log in manually, complete challenge, then re-run |
| MC post fails | Check `MC_API_TOKEN` is set and MC is running (`mc state`) |
| Selectors broken | Edit `lib/selectors.ts` — each field has multiple fallback selectors |
| Playwright not installed | Run `npx playwright install chromium` |
| Session stale | Delete `.session-state.json` and re-run |
| "Filtered N junk items" | Selectors are matching wrong elements. Check `debug-page.html` and update `selectors.ts` |
| Zero items after retries | Site structure changed. Inspect `debug-page.html` + `00-full-page.png` and rebuild selectors |
