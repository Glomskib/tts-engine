# Daily Virals Trending Scraper

Automated Playwright scraper that logs into Daily Virals, extracts the top 20 trending products, and posts a structured report to Mission Control.

## Quick Start

```bash
# Full run (20 items + screenshots + MC post)
npm run trending:daily-virals

# Dry run (3 mock items, no Playwright, writes outputs + MC doc)
npm run trending:daily-virals -- --dry-run
```

## Environment Variables

Add to `web/.env.local`:

```bash
# Required
DAILY_VIRALS_EMAIL=your@email.com
DAILY_VIRALS_PASSWORD=your-password
DAILY_VIRALS_TRENDING_URL=https://dailyvirals.com/trending

# Optional (already set for other pipelines)
MC_API_TOKEN=mc-admin-token-2026
MC_BASE_URL=http://127.0.0.1:3100
```

## Output Files

| File | Description |
|------|-------------|
| `web/data/trending/daily-virals/YYYY-MM-DD/trending.json` | Date-stamped JSON array |
| `web/data/trending/daily-virals/YYYY-MM-DD/trending.csv` | Date-stamped CSV export |
| `web/data/trending/daily-virals/YYYY-MM-DD/screenshots/*.png` | Per-item screenshots |
| `web/data/trending/daily-virals/latest.json` | Copy of most recent run |
| `web/data/trending/daily-virals/latest.csv` | Copy of most recent CSV |

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
- **Category:** drafts
- **Tags:** `trending, daily-virals, YYYY-MM-DD`

The doc includes:
- Summary bullets (count, categories, hooks captured)
- Top 3 "immediate test" picks
- Full top 20 product listing with metrics and links

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
├── run.ts              # CLI entry point
└── lib/
    ├── types.ts        # TypeScript interfaces
    ├── selectors.ts    # DOM selectors (patch here if HTML changes)
    ├── scraper.ts      # Playwright browser automation
    ├── exporter.ts     # JSON/CSV file export
    └── mc-poster.ts    # Mission Control HTTP client
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
