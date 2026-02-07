-- Migration 084: Clawbot MVP
-- Purpose: Add strategy metadata to skits, performance data to videos,
-- and a feedback table for the Clawbot learning loop.

-- ============================================================================
-- STRATEGY METADATA on saved_skits
-- Stores Clawbot's strategy guidance (angle, tone, risk score, reasoning)
-- ============================================================================

ALTER TABLE saved_skits ADD COLUMN IF NOT EXISTS strategy_metadata JSONB DEFAULT NULL;
COMMENT ON COLUMN saved_skits.strategy_metadata IS 'Clawbot strategy: angle, tone, risk_score, reasoning';

-- ============================================================================
-- PERFORMANCE DATA on videos
-- Stores post-publish metrics (views, likes, shares, engagement_rate)
-- ============================================================================

ALTER TABLE videos ADD COLUMN IF NOT EXISTS performance_data JSONB DEFAULT NULL;
COMMENT ON COLUMN videos.performance_data IS 'Post-publish metrics: views, likes, shares, engagement_rate';

-- ============================================================================
-- CLAWBOT FEEDBACK TABLE
-- Links skit performance back to strategy for the learning loop
-- ============================================================================

CREATE TABLE IF NOT EXISTS clawbot_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skit_id UUID NOT NULL REFERENCES saved_skits(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  strategy_used JSONB NOT NULL,
  performance_outcome JSONB,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('positive', 'negative', 'neutral')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_clawbot_feedback_skit ON clawbot_feedback(skit_id);
CREATE INDEX IF NOT EXISTS idx_clawbot_feedback_created ON clawbot_feedback(created_at DESC);

-- RLS
ALTER TABLE clawbot_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert feedback"
  ON clawbot_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can read feedback"
  ON clawbot_feedback FOR SELECT TO authenticated
  USING (true);
