-- ══════════════════════════════════════════════════════════════════
-- Signal Clustering + Velocity Detection — v1 Schema
--
-- Groups product observations into normalized clusters and tracks
-- velocity/trend metrics for early momentum detection.
-- ══════════════════════════════════════════════════════════════════

-- ── Trend Clusters ────────────────────────────────────────────────
-- One row per normalized product within a workspace.
-- Aggregates signals across multiple creators/observations.

CREATE TABLE IF NOT EXISTS public.trend_clusters (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL,
  -- Normalized key for dedup (lowercase, trimmed, punctuation-reduced)
  normalized_key        TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  brand_name            TEXT,
  primary_product_url   TEXT,
  primary_image_url     TEXT,
  -- Aggregated metrics (updated on each observation ingestion)
  signal_count          INTEGER NOT NULL DEFAULT 0,
  creator_count         INTEGER NOT NULL DEFAULT 0,
  posted_creator_count  INTEGER NOT NULL DEFAULT 0,
  first_signal_at       TIMESTAMPTZ,
  last_signal_at        TIMESTAMPTZ,
  -- Velocity (recomputed periodically)
  signals_24h           INTEGER NOT NULL DEFAULT 0,
  signals_prev_24h      INTEGER NOT NULL DEFAULT 0,
  velocity_score        REAL NOT NULL DEFAULT 0,
  -- Trend scoring
  trend_score           INTEGER NOT NULL DEFAULT 0
    CHECK (trend_score >= 0 AND trend_score <= 100),
  trend_label           TEXT NOT NULL DEFAULT 'cold'
    CHECK (trend_label IN ('hot', 'rising', 'warm', 'cold')),
  score_breakdown       JSONB NOT NULL DEFAULT '{}',
  -- Status
  status                TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'hot', 'cooling', 'dismissed', 'actioned')),
  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(workspace_id, normalized_key)
);

CREATE INDEX IF NOT EXISTS idx_trend_clusters_workspace_score
  ON public.trend_clusters(workspace_id, trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_trend_clusters_workspace_status
  ON public.trend_clusters(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_trend_clusters_last_signal
  ON public.trend_clusters(workspace_id, last_signal_at DESC);

-- ── Trend Cluster Members ─────────────────────────────────────────
-- Links observations to their parent cluster.

CREATE TABLE IF NOT EXISTS public.trend_cluster_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_cluster_id      UUID NOT NULL REFERENCES public.trend_clusters(id) ON DELETE CASCADE,
  observation_id        UUID NOT NULL REFERENCES public.creator_product_observations(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(trend_cluster_id, observation_id)
);

CREATE INDEX IF NOT EXISTS idx_trend_cluster_members_cluster
  ON public.trend_cluster_members(trend_cluster_id);
CREATE INDEX IF NOT EXISTS idx_trend_cluster_members_observation
  ON public.trend_cluster_members(observation_id);

-- ── Updated-at trigger ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_trend_clusters_updated') THEN
    CREATE TRIGGER trg_trend_clusters_updated
      BEFORE UPDATE ON public.trend_clusters
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
