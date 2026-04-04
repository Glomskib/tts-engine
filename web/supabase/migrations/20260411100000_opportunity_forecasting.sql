-- ══════════════════════════════════════════════════════════════════
-- Opportunity Forecasting — Schema Extension
--
-- Adds saturation, earlyness, and recommendation fields to
-- trend_clusters for deterministic forecasting.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.trend_clusters
  ADD COLUMN IF NOT EXISTS saturation_score   INTEGER NOT NULL DEFAULT 0
    CHECK (saturation_score >= 0 AND saturation_score <= 100),
  ADD COLUMN IF NOT EXISTS earlyness_score    INTEGER NOT NULL DEFAULT 0
    CHECK (earlyness_score >= 0 AND earlyness_score <= 100),
  ADD COLUMN IF NOT EXISTS recommendation     TEXT NOT NULL DEFAULT 'WATCH'
    CHECK (recommendation IN ('ACT_NOW', 'TEST_SOON', 'WATCH', 'SKIP')),
  ADD COLUMN IF NOT EXISTS forecast_breakdown JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS forecast_updated_at TIMESTAMPTZ;

-- Index for filtering by recommendation
CREATE INDEX IF NOT EXISTS idx_trend_clusters_workspace_recommendation
  ON public.trend_clusters(workspace_id, recommendation);

-- Index for finding early, low-saturation opportunities
CREATE INDEX IF NOT EXISTS idx_trend_clusters_workspace_earlyness
  ON public.trend_clusters(workspace_id, earlyness_score DESC);
