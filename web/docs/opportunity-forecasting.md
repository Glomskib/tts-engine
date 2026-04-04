# Opportunity Forecasting + Saturation Scoring

## Overview

The forecasting layer sits on top of the Trend Engine and answers three questions per product cluster:

1. **Saturation Score (0–100):** "How crowded does this already appear?"
2. **Earlyness Score (0–100):** "How early are we relative to the growth cycle?"
3. **Recommendation:** ACT_NOW | TEST_SOON | WATCH | SKIP

All logic is deterministic and explainable — no AI/ML.

## How This Differs From Other Scores

| Score | Answers | Scope |
|-------|---------|-------|
| **Opportunity Score** (0–100) | "Is this observation worth acting on?" | Per-observation |
| **Trend Score** (0–100) | "Is this product gaining momentum?" | Per-cluster |
| **Saturation Score** (0–100) | "How crowded is this already?" | Per-cluster |
| **Earlyness Score** (0–100) | "Are we still early enough?" | Per-cluster |
| **Recommendation** | "What should I do?" | Per-cluster |

## Saturation Score (0–100)

"How crowded does this product appear?"

### Components (sum to 100)

| Component | Max | What it measures |
|-----------|-----|-----------------|
| creator_density | 30 | How many independent creators (2→8+) |
| posted_ratio | 25 | What % of creators already posted |
| signal_density | 20 | Raw signal volume (5→10→20+) |
| age_penalty | 15 | Older clusters = more established |
| repeat_visibility | 10 | High signals per creator = entrenched |

### Labels
- **Wide Open** (0–14): Barely any competition
- **Light** (15–34): Some activity, lots of room
- **Moderate** (35–59): Growing competition
- **Saturated** (60–100): Heavily crowded

## Earlyness Score (0–100)

"How early are we in the growth cycle?"

### Components (sum to 100)

| Component | Max | What it measures |
|-----------|-----|-----------------|
| recency_bonus | 25 | How recently the cluster first appeared (1d→3d→7d→14d) |
| low_creator_bonus | 25 | Fewer creators = earlier discovery (1→2→3→5+) |
| pre_post_advantage | 20 | Creators haven't posted yet |
| growth_acceleration | 15 | Rising fast = still in early growth phase |
| low_saturation_bonus | 15 | Low saturation reinforces earlyness |

### Labels
- **Very Early** (70–100): Maximum first-mover advantage
- **Early** (45–69): Good window to act
- **Mid-cycle** (20–44): Competition building
- **Late** (0–19): Most opportunity has passed

## Recommendation Logic

Decision matrix based on earlyness + saturation + trend + velocity:

| Recommendation | Condition | Meaning |
|---------------|-----------|---------|
| **ACT_NOW** | Earlyness ≥60, Saturation ≤30, Trend ≥40 | Early + unsaturated + momentum |
| **ACT_NOW** | Earlyness ≥75, Saturation ≤20 | Very early, even without strong trend |
| **TEST_SOON** | Earlyness ≥40, Saturation ≤50, Trend ≥30 | Growing with room to test |
| **TEST_SOON** | Trend ≥60, Saturation ≤60 | Hot trend — act before saturation grows |
| **SKIP** | Saturation ≥60, Earlyness ≤20, Velocity ≤20 | Crowded + late + no momentum |
| **SKIP** | Saturation ≥50, Earlyness ≤10 | Very late stage |
| **WATCH** | Everything else | Not enough signal to recommend action |

## Data Model

Extends `trend_clusters` (no new table):

| Column | Type | Notes |
|--------|------|-------|
| saturation_score | INT (0–100) | Computed saturation |
| earlyness_score | INT (0–100) | Computed earlyness |
| recommendation | TEXT | ACT_NOW, TEST_SOON, WATCH, SKIP |
| forecast_breakdown | JSONB | Full component details + reasons |
| forecast_updated_at | TIMESTAMPTZ | Last recompute |

## Recompute Flow

1. **After trend rescore** — `rescoreCluster()` calls `forecastCluster()` automatically
2. **After observation ingestion** — triggers cluster rescore → triggers forecast
3. **Periodic cron** — `rescore-trends` cron recomputes trends → forecasts follow

No separate cron needed; forecasting piggybacks on the existing rescore pipeline.

## UI

### Trends Page (`/admin/opportunity-radar/trends`)

- Summary cards: Act Now count, Test Soon count, Early+Open count, 24h signals
- Filter tabs by recommendation (All / Act Now / Test Soon / Watch / Skip)
- Sortable by: Trend Score, Earlyness, Saturation, Creators, Last Signal, Velocity
- Table columns: Recommendation, Product, Trend, Earlyness, Saturation, Creators, Velocity, Actions
- Hover tooltip: full breakdown (trend components + forecast reasons)
- Action buttons adapt to recommendation (ACT_NOW → "Create Content", TEST_SOON → "Research")

### Radar Dashboard (`/admin/opportunity-radar`)

- Forecasting Intelligence card: shows top 3 ACT_NOW clusters
- Rising early opportunities count with link to filtered trends view

## Action Logic

| Recommendation | Action Emphasis |
|---------------|-----------------|
| ACT_NOW | Strong "Create Content" button (emerald, prominent) |
| TEST_SOON | "Research" button (amber) |
| WATCH | Standard "Rescore" + "Dismiss" |
| SKIP | Muted actions, emphasis on dismiss |

## API

| Method | Path | New Params |
|--------|------|-----------|
| GET | `/api/admin/opportunity-radar/trends` | `recommendation`, `max_saturation`, `min_earlyness`, `sort`, `dir` |

## Key Files

| File | Purpose |
|------|---------|
| `lib/opportunity-radar/forecasting.ts` | Core forecasting engine |
| `supabase/migrations/20260411100000_opportunity_forecasting.sql` | Schema extension |
| `lib/opportunity-radar/trend-scoring.ts` | Wired to call forecastCluster() |
| `app/admin/opportunity-radar/trends/page.tsx` | Updated UI |
| `app/admin/opportunity-radar/page.tsx` | Dashboard intelligence card |
| `app/api/admin/opportunity-radar/trends/route.ts` | Updated API filters |

## Limitations

- Signal count for saturation depends on scan frequency (infrequent scans = undercount)
- No external market data — saturation is relative to what the workspace observes
- Earlyness assumes linear growth cycles; real products can spike/plateau unpredictably
- Recommendation thresholds are hand-tuned; may need adjustment as real data accumulates

## Future Improvements

- Weight saturation by creator follower count (high-follower creators saturate faster)
- Add niche-relative saturation (50 creators in "wellness" is different from "quantum computing")
- Incorporate external signals (TikTok trending sounds, Google Trends)
- A/B test recommendation thresholds against conversion outcomes
- Time-series forecasting: predict when a product will peak
