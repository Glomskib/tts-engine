-- Migration 103: Business Automation Features
-- Tasks 63-66: Content packages, pattern analysis, VA briefs, product rotation

-- ============================================================
-- Content Packages (Task 63)
-- ============================================================
CREATE TABLE IF NOT EXISTS content_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  script_count INTEGER NOT NULL DEFAULT 0,
  scripts_kept INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'complete', 'failed')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES content_packages(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  brand TEXT,
  content_type TEXT,
  hook TEXT,
  script_body JSONB,
  score NUMERIC(5,2) DEFAULT 0,
  kept BOOLEAN DEFAULT true,
  added_to_pipeline BOOLEAN DEFAULT false,
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_packages_user ON content_packages(user_id);
CREATE INDEX IF NOT EXISTS idx_content_package_items_package ON content_package_items(package_id);

-- ============================================================
-- Winner Pattern Analysis (Task 64)
-- ============================================================
CREATE TABLE IF NOT EXISTS winner_pattern_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  analysis JSONB NOT NULL DEFAULT '{}',
  winner_count INTEGER NOT NULL DEFAULT 0,
  top_hook_types JSONB DEFAULT '[]',
  top_formats JSONB DEFAULT '[]',
  top_categories JSONB DEFAULT '[]',
  winning_formula TEXT,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_winner_patterns_user ON winner_pattern_analyses(user_id);

-- ============================================================
-- VA Briefs (Task 65)
-- ============================================================
CREATE TABLE IF NOT EXISTS va_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  brief_markdown TEXT NOT NULL,
  brief_data JSONB DEFAULT '{}',
  due_date TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_briefs_video ON va_briefs(video_id);
CREATE INDEX IF NOT EXISTS idx_va_briefs_user ON va_briefs(user_id);

-- ============================================================
-- Product Rotation (Task 66)
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS rotation_score NUMERIC(5,2) DEFAULT 50;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_content_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS content_count_7d INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS content_count_30d INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS trending_boost BOOLEAN DEFAULT false;

-- ============================================================
-- Daily Analytics Summaries (Task 69)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  summary_date DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  videos_created INTEGER DEFAULT 0,
  videos_posted INTEGER DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  best_video_id UUID,
  pipeline_health JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_user_date ON daily_summaries(user_id, summary_date DESC);

-- ============================================================
-- Script Generation Presets (Task 62)
-- ============================================================
CREATE TABLE IF NOT EXISTS script_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_script_presets_user ON script_presets(user_id);

-- RLS Policies
ALTER TABLE content_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE winner_pattern_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_presets ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by supabaseAdmin)
-- No user-level policies needed since we use service role key for all writes
