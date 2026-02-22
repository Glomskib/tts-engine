# Daily Virals Trending Skill

Scrape the top 20 trending TikTok products from Daily Virals, export structured data, and post a daily report to Mission Control.

## When to Run

- Daily, ideally morning (trending data refreshes overnight)
- On demand when researching new product niches

## Commands

```bash
# Full run — Playwright scrape, screenshots, MC post, DB upsert
npm run trending:daily-virals

# Dry run — 3 mock items, writes outputs + MC doc, no Playwright
npm run trending:daily-virals -- --dry-run
```

## How Flash/Bolt Runs It

1. Agent calls `npm run trending:daily-virals` from the `web/` directory
2. Script loads env from `web/.env.local`
3. Playwright logs into Daily Virals, navigates to trending page, extracts top 20
4. If blocked by CAPTCHA/2FA, posts a `BLOCKED` doc to MC and exits
5. Exports data locally, posts report to MC, upserts to Supabase

For automated/cron use, import the job function directly:

```typescript
import { runDailyViralsJob } from './scripts/trending/daily-virals/run';

const result = await runDailyViralsJob({ dryRun: false });
// result: { ok, itemCount, dbUpserted, mcPosted, error? }
```

## Output Files

All outputs land in `web/data/trending/daily-virals/YYYY-MM-DD/`:

| File | Description |
|------|-------------|
| `trending.json` | Top 20 items as normalized JSON array |
| `trending.csv` | Spreadsheet-friendly CSV with metrics |
| `screenshots/` | Per-item screenshots (`01-product-name.png`) |

Root-level `latest.json` and `latest.csv` always point to the most recent run.

Public export: `web/public/trending.json` (flattened, safe for frontend).

## Mission Control Output

Posted automatically to MC `/api/documents`:

- **Lane:** FlashFlow
- **Category:** intel
- **Tags:** `trending, daily-virals, YYYY-MM-DD`

The doc includes:
- Summary (item count, categories, hooks captured)
- Top 3 "immediate test" picks with links
- Full top 20 listing with metrics and hooks

If scraping is blocked, a `BLOCKED` doc is posted instead (tags: `blocked, needs-input, daily-virals`).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DAILY_VIRALS_EMAIL` | For live scrape | Login email |
| `DAILY_VIRALS_PASSWORD` | For live scrape | Login password |
| `DAILY_VIRALS_TRENDING_URL` | For live scrape | Trending page URL |
| `MC_API_TOKEN` | For MC posting | Mission Control Bearer token |
| `MC_BASE_URL` | No (default: `http://127.0.0.1:3100`) | MC base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | For DB persistence | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For DB persistence | Supabase service role key |

## Graceful Degradation

- Missing scraper env vars → auto-falls back to mock data
- Missing MC token → skips MC posting, still exports locally
- Missing Supabase vars → skips DB/storage, still exports locally
- CAPTCHA/2FA → posts BLOCKED doc to MC, exits with error

## Data Schema

Each item in `trending.json`:

```typescript
{
  rank: number;           // 1-20
  title: string;
  product_name: string;
  category: string;
  metrics: {
    views?: string;       // "5.4M"
    gmv?: string;         // "$279K"
    velocity?: string;
    units_sold?: string;
    revenue?: string;
  };
  hook_text: string;      // On-screen hook / caption
  script_snippet: string;
  source_url: string;
  thumbnail_url: string;
  ai_observation: string; // Populated by downstream AI
  captured_at: string;    // ISO 8601
}
```
