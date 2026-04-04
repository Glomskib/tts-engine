# Community Intelligence

## Overview

Community Intelligence enables FlashFlow to learn from user video performance and feed those signals back into the trend engine and opportunity feed. The system records community signals when videos are published, extracts winning hooks from high-performing content, and creates network effects across users.

## Architecture

### Data Flow

```
User publishes video
  → POST /api/content-items/[id]/posts
  → recordCommunitySignal() (non-blocking)
  → Resolves trend cluster by product key
  → Updates cluster aggregates (community_wins, community_total_views)
  → When metrics arrive → processWinningHook() extracts + scores hooks
```

## Tables

### community_signals

Records one entry per published video linked to a trend-tracked product.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | PK |
| workspace_id | UUID | Tenant scope |
| content_item_id | UUID | Source content item |
| content_item_post_id | UUID | Source post record |
| trend_cluster_id | UUID | Linked trend cluster |
| product_name | TEXT | Human-readable name |
| normalized_product_key | TEXT | Normalized key for matching |
| views, likes, comments, shares | INT | Performance metrics |
| posted_at | TIMESTAMPTZ | When posted |
| created_at | TIMESTAMPTZ | Record creation |

### winning_hooks

Hooks from high-performing content (performance_score >= 50).

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | PK |
| workspace_id | UUID | Tenant scope |
| content_item_id | UUID | Source content item |
| trend_cluster_id | UUID | Linked cluster |
| hook_text | TEXT | The hook text |
| hook_source | TEXT | generated, manual, extracted |
| performance_score | INT 0-100 | Weighted engagement score |
| views, likes | INT | Raw metrics |
| engagement_rate | NUMERIC | (likes+comments+shares)/views % |

### trend_clusters extensions

| Column | Type | Purpose |
|--------|------|---------|
| community_wins | INT | Count of published videos |
| community_total_views | BIGINT | Sum of views across signals |
| community_best_hook | TEXT | Top hook for quick display |

## Trend Engine Integration

The trend scoring engine includes a **community_bonus** component (max 10 points):

| Condition | Bonus | Reason |
|-----------|-------|--------|
| 3+ wins OR 100K+ views | 10 | Strong community momentum |
| 2 wins OR 50K+ views | 7 | Community signal confirmed |
| 1 win | 4 | Community confirmation |
| No signals | 0 | — |

## Hook Extraction

Hooks are extracted from content items in priority order:
1. `primary_hook` field (explicitly set)
2. `script_json.beats[0]` (first beat of structured script)
3. First sentence of `script_text`
4. First sentence of `caption`

### Performance Scoring

Uses the existing winners engine formula:
- Engagement rate (40%): (likes+comments+shares+saves)/views
- View velocity (30%): views / workspace median
- Share rate (20%): shares/views
- Completion bonus (10%): completion_rate or neutral

Only hooks with score >= 50 are saved as winning_hooks.

## Key Files

| File | Purpose |
|------|---------|
| `lib/opportunity-radar/community-signals.ts` | Signal recording + aggregation |
| `lib/opportunity-radar/hook-extraction.ts` | Hook extraction + winning hook processing |
| `lib/opportunity-radar/trend-scoring.ts` | Community bonus in trend scoring |
| `app/api/content-items/[id]/posts/route.ts` | Signal recording on post creation |
| `supabase/migrations/20260412100000_community_intelligence.sql` | Schema |

## Limitations

- Metrics at recording time may be zero (just posted); need subsequent metric refresh
- Hook extraction is deterministic — may miss hooks in unusual script formats
- Community bonus is capped at 10 to avoid overwhelming trend scoring base components
- Winning hook threshold (score >= 50) is hand-tuned; may need adjustment

## Future Improvements

- Automatic TikTok metrics ingestion (sync views/likes periodically)
- Cross-workspace anonymized intelligence (aggregate patterns without exposing private data)
- Conversion-based hook scoring (link to actual product sales)
- Hook similarity clustering (group similar hooks into patterns)
