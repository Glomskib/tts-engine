# Creator Performance Profiles

## Overview

Workspace-level performance profiles that learn what hooks, angles, formats, and video lengths work best for each creator. Profiles build automatically from posted content with tracked metrics.

## How It Works

```
Content posted → Metrics tracked (views, engagement, completion)
  → Aggregation engine pulls all posts with snapshots
  → Scores each post via computePerformanceScore()
  → Builds dimension breakdowns (hook, angle, format, platform, length, product)
  → Calculates confidence per dimension
  → Stores in creator_performance_profiles + creator_profile_dimensions
```

## Dimensions Tracked

| Dimension | Source | Description |
|-----------|--------|-------------|
| `platform` | content_item_posts.platform | TikTok, Instagram, YouTube performance |
| `hook_pattern` | Caption first sentence + content_memory | Which hook patterns perform best |
| `angle` | content_memory patterns | Which content angles resonate |
| `format` | brief_selected_cow_tier | Video format/structure |
| `length_bucket` | avg_watch_time_seconds | micro (<15s), short (15-30s), medium (30-60s), long (60s+) |
| `product` | content_item_posts.product_id | Which products perform best |
| `hook_type` | proven_hooks.hook_type | Spoken vs visual vs text hooks |

## Confidence Levels

| Level | Criteria | Meaning |
|-------|----------|---------|
| Low | <5 samples | Not enough data — exploration recommended |
| Medium | 5-20 samples | Patterns emerging — use with caution |
| High | 20+ samples | Reliable signal — bias generation toward these |

## API

### GET /api/admin/creator-profile

Returns the full profile summary including dimension breakdowns (top 5 per dimension, min 2 samples).

### POST /api/admin/creator-profile

Triggers re-aggregation. Returns total posts processed and dimensions updated.

## UI

Page at `/admin/creator-profile`:
- Overview stats: total posts, total views, avg engagement, best score
- Dimension cards with ranked entries, score bars, and confidence badges
- "Refresh Profile" to manually re-aggregate
- "How it works" explainer

## Data Sources

The aggregation engine pulls from:
1. `content_item_posts` — all posted content with platform, product, caption
2. `content_item_metrics_snapshots` — views, likes, comments, shares, saves, completion
3. `winner_pattern_evidence` — which posts are winners (for win rate)
4. `content_memory` — hook/angle patterns from postmortems
5. `proven_hooks` — hook type effectiveness

## Generation Feedback

`getProfileSuggestions(workspaceId)` returns:
- `preferred_angles` — top 3 performing angles
- `preferred_hook_patterns` — top 3 hook patterns
- `preferred_formats` — top 2 formats
- `preferred_length` — best length bucket
- `confidence` — overall confidence level

This can be fed into content generation to bias toward what works while still exploring.

## Schema

Tables: `creator_performance_profiles`, `creator_profile_dimensions`, `creator_profile_confidence`

Migration: `supabase/migrations/20260415100000_creator_performance_profiles.sql`

## Key Files

| File | Purpose |
|------|---------|
| `lib/content-intelligence/creator-profile.ts` | Aggregation engine + profile reader + suggestions |
| `app/api/admin/creator-profile/route.ts` | API endpoint (GET + POST) |
| `app/admin/creator-profile/page.tsx` | UI page |
| `lib/content-intelligence/winners/scoring.ts` | Performance scoring function |
