-- Creator Performance Profiles
-- Workspace-level aggregated profiles that learn what works for each creator.

-- Main profile table: one row per workspace, updated incrementally
CREATE TABLE IF NOT EXISTS creator_performance_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  total_posts INTEGER NOT NULL DEFAULT 0,
  total_views BIGINT NOT NULL DEFAULT 0,
  avg_engagement_rate NUMERIC(6,3) DEFAULT 0,
  median_views BIGINT DEFAULT 0,
  best_score INTEGER DEFAULT 0,
  last_aggregated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id)
);

-- Dimension breakdown: stores top performers by each dimension
CREATE TABLE IF NOT EXISTS creator_profile_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  dimension TEXT NOT NULL, -- 'hook_pattern' | 'angle' | 'persona' | 'format' | 'platform' | 'product' | 'length_bucket'
  dimension_value TEXT NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  avg_score NUMERIC(6,2) DEFAULT 0,
  avg_views BIGINT DEFAULT 0,
  avg_engagement_rate NUMERIC(6,3) DEFAULT 0,
  win_rate NUMERIC(5,2) DEFAULT 0, -- % of posts that were winners
  best_post_id UUID,
  last_used_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, dimension, dimension_value)
);

-- Confidence tracking: how reliable each dimension is
CREATE TABLE IF NOT EXISTS creator_profile_confidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  total_samples INTEGER NOT NULL DEFAULT 0,
  distinct_values INTEGER NOT NULL DEFAULT 0,
  confidence_level TEXT NOT NULL DEFAULT 'low', -- 'low' (<5 samples) | 'medium' (5-20) | 'high' (20+)
  exploration_needed BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, dimension)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profile_dims_workspace ON creator_profile_dimensions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_profile_dims_lookup ON creator_profile_dimensions(workspace_id, dimension, avg_score DESC);
CREATE INDEX IF NOT EXISTS idx_profile_confidence_workspace ON creator_profile_confidence(workspace_id);
