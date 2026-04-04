# Signal Clustering + Velocity Detection — Trend Engine

## Overview

The trend engine transforms raw product observations into early momentum signals.
It answers: **"Which products are gaining traction unusually quickly?"**

Fully deterministic, explainable, and cost-safe — no AI/ML.

## Architecture

```
Observation Ingested
  → normalizeProductKey(name, brand)
  → resolveCluster(workspace, name, brand, url)
  → linkObservationToCluster(cluster, observation)
  → rescoreCluster(cluster)
      → refreshClusterMetrics()
      → computeVelocity()
      → computeTrendScore()
      → persist to trend_clusters
```

## Data Model

### `trend_clusters`

One row per normalized product within a workspace.

| Column | Type | Notes |
|--------|------|-------|
| normalized_key | TEXT | Dedup key (brand::product, lowercased, cleaned) |
| display_name | TEXT | Human-readable product name |
| signal_count | INT | Total times_seen across members |
| creator_count | INT | Distinct creators |
| posted_creator_count | INT | Creators who have posted |
| trend_score | INT | 0–100 composite score |
| trend_label | TEXT | hot / rising / warm / cold |
| score_breakdown | JSONB | Full scoring details + reasons |
| velocity_score | REAL | Velocity sub-score |
| signals_24h / signals_prev_24h | INT | Rolling window counts |
| status | TEXT | new / hot / cooling / dismissed / actioned |

UNIQUE on (workspace_id, normalized_key).

### `trend_cluster_members`

Join table: links observations to their parent cluster.
UNIQUE on (trend_cluster_id, observation_id).

## Product Clustering

**Resolution order:**
1. Normalized product key match (brand::name, cleaned)
2. URL match (fallback)
3. Create new cluster

**Normalization rules** (`normalizeProductKey`):
- Lowercase, trim
- Remove ™ ® © symbols
- Remove pipe-delimited suffixes
- Remove parenthetical variants
- Remove trailing size/variant descriptors
- Prepend `brand::` for disambiguation

## Trend Scoring (0–100)

Five components:

| Component | Max | What it measures |
|-----------|-----|-----------------|
| velocity | 30 | Signal accumulation speed (from velocity engine) |
| clustering | 25 | Independent creator signals |
| early_signal | 20 | Not-yet-posted advantage |
| confirmation | 15 | Confidence-weighted signal strength |
| recency | 10 | Freshness of the cluster |

**Labels:** hot (70+), rising (45+), warm (20+), cold (<20)

## Velocity Engine

Windowed signal counting over 24h periods.

**Velocity Score (0–100):**
- signal_volume (max 25): raw count in current window
- growth (max 25): acceleration vs previous 24h
- creator_diversity (max 25): distinct creators
- freshness (max 25): hours since last signal

## Recompute Flow

1. **On ingestion** — after each new/updated observation, rescore its cluster
2. **Periodic cron** — `GET /api/cron/rescore-trends` recomputes all active clusters
3. **Manual** — "Rescore" button on the trends UI page

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/opportunity-radar/trends` | List clusters (filterable by label, status, min_score) |
| POST | `/api/admin/opportunity-radar/trends` | Actions: rescore, dismiss, set_status |
| GET | `/api/cron/rescore-trends` | Periodic bulk rescore (CRON_SECRET auth) |

## UI

`/admin/opportunity-radar/trends` — Admin page showing:
- Summary cards (hot count, rising count, total clusters, 24h signals)
- Label filter tabs (All / Hot / Rising / Warm / Cold)
- Min score slider
- Table with: score, label, product, signals, creators, velocity, last signal, actions
- Score tooltip with full breakdown + reasons
- Actions: Rescore, Actioned, Dismiss

## Key Files

| File | Purpose |
|------|---------|
| `lib/opportunity-radar/clustering.ts` | Product key normalization, cluster resolution, metrics refresh |
| `lib/opportunity-radar/velocity.ts` | Windowed velocity computation and scoring |
| `lib/opportunity-radar/trend-scoring.ts` | Composite trend score (5 components) |
| `lib/opportunity-radar/ingestion.ts` | Cluster wiring on observation ingest |
| `supabase/migrations/20260410100000_trend_clusters.sql` | Schema |
| `app/api/admin/opportunity-radar/trends/route.ts` | Admin API |
| `app/api/cron/rescore-trends/route.ts` | Periodic rescore cron |
| `app/admin/opportunity-radar/trends/page.tsx` | UI page |
