# Hook Performance Intelligence

## Overview

The Hook Intelligence layer turns generated hooks and real performance data into reusable, ranked creative intelligence. It answers: which hooks are actually working, for which products, and feeds that intelligence back into content creation.

## Architecture

### Data Flow

```
Content item published → metrics captured
  → processWinningHook(contentItemId, metrics)
  → Extract hook (primary_hook → script_json → script_text → caption)
  → Compute performance score (engagement/views/shares/completion)
  → If score >= 50 → save to winning_hooks
  → Update cluster community_best_hook
```

## Hook Extraction Rules

Hooks are extracted from content items in priority order:

1. **primary_hook**: Explicitly set field — highest fidelity
2. **script_json.beats[0]**: First beat of structured script data
3. **script_text first sentence**: First sentence (up to 150 chars)
4. **caption first sentence**: Fallback from social caption

Each extraction has a `hook_source` tag:
- `generated` — from primary_hook (set by AI generation)
- `manual` — manually entered
- `extracted` — derived from script/caption text

## Performance Scoring Formula

Uses the existing winners engine scoring (0-100 scale):

```
score = engagement_rate * 0.4
      + view_velocity * 0.3
      + share_rate * 0.2
      + completion_bonus * 0.1
```

| Component | Weight | Normalization |
|-----------|--------|---------------|
| Engagement rate | 40% | (likes+comments+shares+saves)/views, 10%+ = 100 |
| View velocity | 30% | views / median, capped at 5x |
| Share rate | 20% | shares/views, 5%+ = 100 |
| Completion bonus | 10% | completion_rate, neutral if unknown |

**Winning threshold**: score >= 50

## Surfaces

### Hook Intelligence Page (`/admin/hook-intelligence`)

- Top performing hooks ranked by score
- Filterable by time window (7d / 30d / 90d / all)
- Filterable by minimum score
- Shows: score, hook text, product, views, engagement %, source

### Opportunity Feed (`/admin/opportunity-feed`)

- Each feed card shows best hook for the cluster
- Community momentum badge when community signals exist

### Opportunity Radar Dashboard (`/admin/opportunity-radar`)

- Quick link to Hook Intelligence page
- Winning hooks visible in Forecasting Intelligence card

## Feedback into Creation

Hook intelligence improves content creation by:
1. **Best hook display** — opportunity feed cards show top-performing hook text
2. **Cluster context** — when creating content for a product, recent winning hooks are visible
3. **Pattern learning** — repeated wins for similar hooks inform future generation

## API

| Method | Path | Params |
|--------|------|--------|
| GET | `/api/admin/hook-intelligence` | `cluster_id`, `product_key`, `min_score`, `days_back`, `source`, `limit` |

Response includes `data` (hooks array) and `stats` (total, avg_score, top_score).

## Key Files

| File | Purpose |
|------|---------|
| `lib/opportunity-radar/hook-extraction.ts` | Hook extraction + performance scoring + saving |
| `lib/content-intelligence/winners/scoring.ts` | Performance score computation (reused) |
| `app/api/admin/hook-intelligence/route.ts` | API endpoint |
| `app/admin/hook-intelligence/page.tsx` | UI page |

## Current Limitations

- Hook extraction is text-based — misses hooks that are purely visual/audio
- Performance scoring uses a fixed median (1000 views) — should use workspace percentile
- No hook similarity clustering yet (exact text matching only)
- No automatic metrics refresh — relies on manual metric entry or future TikTok sync

## Future Improvements

- Workspace-specific median views for more accurate scoring
- Hook similarity clustering (group "POV:" hooks together)
- A/B test integration — compare hooks directly
- AI-powered hook refinement suggestions based on winning patterns
- Conversion-based scoring (link to product sales)
- Cross-workspace anonymized hook patterns
