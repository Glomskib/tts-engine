# Metrics System Audit

**Date:** 2026-03-09
**Status:** Partially operational — TikTok internal bridge active, other providers disabled

## Pipeline Architecture

```
Data Sources                    Storage                        Consumers
─────────────                   ───────                        ─────────
sync-tiktok-videos (daily) ──→ tiktok_videos ──┐
                                                │
metrics-sync (every 30 min) ──→ content_item_metrics_snapshots ──→ contentScore
  └─ internal_lookup ─────────────────────────┘                ──→ detectWinners
  └─ posting_provider (DISABLED)                               ──→ winnerDetector
  └─ scrape_lite (DISABLED)                                    ──→ productPerformance
                                                               ──→ performance dashboard
manual entry via API ─────────→ content_item_metrics_snapshots ──→ postmortem generation
                                                               ──→ creator dashboard
                                                               ──→ brand dashboard
```

## Two Metrics Systems

This codebase has two separate metrics systems:

### 1. Content Intelligence Layer (NEW — active)

| Component | Purpose |
|-----------|---------|
| `content_item_posts` | Links content items to social media posts |
| `content_item_metrics_snapshots` | Time-series snapshots of post performance |
| `content_item_ai_insights` | AI-generated analysis (postmortems, hook analysis) |
| `winner_patterns_v2` | Normalized patterns of winning content |

**Migration:** `20260331300000_content_intelligence_layer.sql`, `20260402000000_winner_patterns_engine.sql`

### 2. Legacy Video Metrics (older — still used by admin dashboard)

| Component | Purpose |
|-----------|---------|
| `video_metrics` | Daily snapshots per video |
| `tiktok_videos` | TikTok video catalog with view/like/comment/share counts |
| `videos.views_total` etc. | Aggregate counters on videos table |

**Migration:** `006_video_performance.sql`

## Active Providers

### internal_lookup (ACTIVE — TikTok only)

**How it works:**
1. `sync-tiktok-videos` cron runs daily, fetches all user videos from TikTok Content API
2. Stores view_count, like_count, comment_count, share_count in `tiktok_videos` table
3. `metrics-sync` cron runs every 30 min, finds `content_item_posts` with platform='tiktok'
4. Extracts TikTok video ID from `platform_post_id` or `post_url`
5. Looks up `tiktok_videos` row and creates a `content_item_metrics_snapshots` entry
6. Auto-runs `scoreAndPersist()` to compute content grade (A+/A/B/C/D)

**Data available:** views, likes, comments, shares
**Not available:** saves, avg_watch_time, completion_rate (not from Content API)

**Requirements:**
- `TIKTOK_CONTENT_APP_KEY` and `TIKTOK_CONTENT_APP_SECRET` configured
- At least one `tiktok_content_connections` record
- Posts must have `platform='tiktok'` and a recognizable video URL

### Manual Entry (ACTIVE)

**Endpoint:** `POST /api/content-items/{id}/metrics`
**How it works:** User enters metrics manually via dashboard, stored directly in snapshots.

## Disabled Providers

### posting_provider (DISABLED)

**Service:** Late.dev analytics API
**Why disabled:** `getAnalytics()` endpoint returns aggregate platform-level data (total impressions, likes, etc. across all posts), not per-post metrics. Cannot attribute metrics to individual content_item_posts.
**To enable:** Requires Late.dev to add per-post analytics, or requires building an attribution layer that maps aggregate changes to individual posts.

### scrape_lite (DISABLED)

**Service:** Headless browser scraping
**Why disabled:** Vercel serverless functions cannot run headless browsers. Would require external infrastructure (HP Windows machine via Playwright, or a scraping API service).
**To enable:** Deploy browser-service on HP machine and create API bridge, or integrate a scraping API like Apify.

### Platform OAuth Providers (NOT IMPLEMENTED)

The per-post sync API (`/api/content-items/posts/{postId}/metrics/sync`) uses a separate `MetricsProvider` interface with platform-specific implementations:
- `tiktok.ts` — Now implemented (looks up tiktok_videos table)
- `instagram.ts` — Throws `ProviderNotConfiguredError`
- `youtube.ts` — Throws `ProviderNotConfiguredError`

## Cron Behavior

### metrics-sync (`*/30 * * * *`)

1. Finds `content_item_posts` with status='posted', not synced in last 12 hours
2. Processes up to 20 posts per run
3. Tries internal_lookup provider (only enabled provider)
4. If metrics found: inserts snapshot, updates metrics_source, runs scoring
5. After all posts: triggers `updateProductPerformance()` for affected workspaces
6. Returns diagnostic JSON with provider stats (attempted/succeeded counts)

**Idempotency:** Safe to re-run. New snapshots are always INSERT (never UPDATE), so duplicates just add more time-series data. The 12-hour stale threshold prevents excessive re-syncing.

**Rate limiting:** BATCH_SIZE=20 per run, 30-minute interval = max 40 posts/hour.

## Data Schema

### content_item_metrics_snapshots

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| workspace_id | uuid | Workspace scoping |
| content_item_post_id | uuid | FK to content_item_posts |
| captured_at | timestamptz | When snapshot was taken |
| views | bigint | View count |
| likes | bigint | Like count |
| comments | bigint | Comment count |
| shares | bigint | Share count |
| saves | bigint | Save count |
| avg_watch_time_seconds | numeric | Average watch time |
| completion_rate | numeric | Video completion rate |
| source | text | Provider that supplied data |
| raw_json | jsonb | Raw API response |

### content_item_posts (relevant columns)

| Column | Type | Description |
|--------|------|-------------|
| platform | text | tiktok, instagram, youtube, etc. |
| post_url | text | Full URL to the post |
| platform_post_id | text | Platform-specific ID |
| metrics_source | text | Last provider used |
| performance_score | text | A+/A/B/C/D grade |

## Downstream Dependencies

| System | Depends On | Behavior Without Metrics |
|--------|-----------|-------------------------|
| Content Score | latest snapshot | Returns null, post ungraded |
| Winner Detection | snapshots + postmortem | Skips posts without metrics |
| Product Performance | latest snapshot per post | Products show 0 engagement |
| Performance Dashboard | all snapshots last 90 days | Shows empty charts, 0 stats |
| Creator Dashboard | latest snapshot | "No data yet" for top video |
| Brand Dashboard | latest snapshot | 0% avg engagement |
| Postmortem Generation | latest snapshot (required) | Returns "no metrics available" |

All downstream systems handle missing metrics gracefully — empty states, not crashes.

## Diagnostics

### System Status Endpoint

`GET /api/admin/system-status` now includes a `metricsSystem` section:

```json
{
  "metricsSystem": {
    "providers": {
      "internal_lookup": { "enabled": true, "platform": "tiktok" },
      "posting_provider": { "enabled": false, "reason": "..." },
      "scrape_lite": { "enabled": false, "reason": "..." }
    },
    "lastSnapshot": "2026-03-09T...",
    "totalSnapshots": 142,
    "postsWithMetrics": 38,
    "postsWithoutMetrics": 12
  }
}
```

### Cron Response

`GET /api/cron/metrics-sync` returns provider stats:

```json
{
  "ok": true,
  "synced": 5,
  "skipped": 15,
  "total_candidates": 20,
  "providers": {
    "internal_lookup": { "enabled": true, "attempted": 20, "succeeded": 5 },
    "posting_provider": { "enabled": false, "reason": "..." },
    "scrape_lite": { "enabled": false, "reason": "..." }
  }
}
```

## What Would Make This System Fully Operational

1. **Instagram metrics:** Implement Instagram Graph API provider (requires Facebook Login business tokens)
2. **YouTube metrics:** Implement YouTube Data API v3 provider (requires OAuth consent)
3. **Late.dev per-post analytics:** Wait for Late.dev to expose post-level metrics
4. **Scraping fallback:** Deploy browser-service and create API bridge for public metric scraping
5. **Backfill:** One-time job to create content_item_posts for existing tiktok_videos that don't have content items yet

## Files Changed (This Sprint)

| File | Change |
|------|--------|
| `app/api/cron/metrics-sync/route.ts` | Replaced 3 stub providers with 1 working internal_lookup + 2 explicitly disabled. Added provider diagnostics to response. |
| `lib/metrics/providers/tiktok.ts` | Implemented real provider that queries tiktok_videos table |
| `app/api/admin/system-status/route.ts` | Added metricsSystem health section |
| `docs/metrics-system-audit.md` | This file |
