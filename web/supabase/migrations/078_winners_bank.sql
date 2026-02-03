-- Migration 078: Winners Bank Complete Overhaul
-- Purpose: Unified winners system for tracking successful scripts and reference videos
-- Replaces: is_winner column on scripts, reference_videos for winners

-- ============================================================================
-- WINNERS BANK TABLE
-- Stores both our successful scripts AND external reference videos
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.winners_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Source identification
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('our_script', 'external')),
  script_id UUID REFERENCES public.scripts(id) ON DELETE SET NULL, -- Link to our script if applicable
  skit_id UUID REFERENCES public.saved_skits(id) ON DELETE SET NULL, -- Link to saved skit if applicable

  -- Video details
  tiktok_url TEXT,
  video_title VARCHAR(255),
  thumbnail_url TEXT,
  posted_at TIMESTAMPTZ,

  -- Creator info (for external videos)
  creator_handle VARCHAR(100),
  creator_niche VARCHAR(100),

  -- Performance metrics
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  saves BIGINT DEFAULT 0,
  engagement_rate DECIMAL(5,2), -- Calculated automatically

  -- Watch time / retention
  avg_watch_time_seconds DECIMAL(5,1),
  avg_watch_time_percent DECIMAL(5,1),
  retention_3s DECIMAL(5,1), -- % who watched past 3 seconds
  retention_half DECIMAL(5,1), -- % who watched to halfway
  retention_full DECIMAL(5,1), -- % who watched to end

  -- Content analysis (user input)
  product_name VARCHAR(255),
  product_category VARCHAR(100),
  hook_text TEXT, -- The actual hook used
  hook_type VARCHAR(50), -- question, bold_statement, pov, curiosity_gap, etc.
  content_format VARCHAR(50), -- skit, story, tutorial, comparison, etc.
  video_length_seconds INT,

  -- User insights
  user_notes TEXT, -- Why they think it worked
  tags TEXT[], -- User-defined tags for filtering

  -- AI analysis (generated)
  ai_analysis JSONB, -- Structured analysis of why it worked
  ai_analyzed_at TIMESTAMPTZ,

  -- Pattern extraction
  extracted_patterns JSONB, -- Hooks, pacing, structure elements

  -- Scoring
  performance_score DECIMAL(3,1), -- 1-10 calculated score

  -- Meta
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_winners_bank_user ON public.winners_bank(user_id);
CREATE INDEX IF NOT EXISTS idx_winners_bank_source ON public.winners_bank(user_id, source_type);
CREATE INDEX IF NOT EXISTS idx_winners_bank_performance ON public.winners_bank(user_id, performance_score DESC);
CREATE INDEX IF NOT EXISTS idx_winners_bank_category ON public.winners_bank(user_id, product_category);
CREATE INDEX IF NOT EXISTS idx_winners_bank_tags ON public.winners_bank USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_winners_bank_script ON public.winners_bank(script_id) WHERE script_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_winners_bank_skit ON public.winners_bank(skit_id) WHERE skit_id IS NOT NULL;

-- RLS Policies
ALTER TABLE public.winners_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own winners" ON public.winners_bank;
CREATE POLICY "Users can view own winners" ON public.winners_bank
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own winners" ON public.winners_bank;
CREATE POLICY "Users can insert own winners" ON public.winners_bank
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own winners" ON public.winners_bank;
CREATE POLICY "Users can update own winners" ON public.winners_bank
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own winners" ON public.winners_bank;
CREATE POLICY "Users can delete own winners" ON public.winners_bank
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- WINNER PATTERNS TABLE
-- Aggregated patterns updated periodically from winners_bank
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.winner_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Aggregated insights
  top_hook_types JSONB, -- {type: count, avg_engagement}
  top_content_formats JSONB,
  optimal_video_length JSONB, -- {min, max, sweet_spot}
  best_posting_times JSONB,
  successful_hooks TEXT[], -- Top 10 actual hooks
  common_patterns TEXT[], -- AI-extracted patterns

  -- What to avoid
  underperforming_patterns TEXT[],

  -- Stats
  total_winners INT DEFAULT 0,
  avg_engagement_rate DECIMAL(5,2),
  avg_views BIGINT,

  -- Meta
  last_analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- RLS for winner_patterns
ALTER TABLE public.winner_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own patterns" ON public.winner_patterns;
CREATE POLICY "Users can view own patterns" ON public.winner_patterns
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert own patterns" ON public.winner_patterns;
CREATE POLICY "Users can upsert own patterns" ON public.winner_patterns
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================

-- Calculate engagement rate automatically
CREATE OR REPLACE FUNCTION calculate_winner_engagement_rate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.views > 0 THEN
    NEW.engagement_rate := ((COALESCE(NEW.likes, 0) + COALESCE(NEW.comments, 0) + COALESCE(NEW.shares, 0) + COALESCE(NEW.saves, 0))::DECIMAL / NEW.views) * 100;
  ELSE
    NEW.engagement_rate := 0;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_winners_bank_engagement ON public.winners_bank;
CREATE TRIGGER trigger_winners_bank_engagement
  BEFORE INSERT OR UPDATE ON public.winners_bank
  FOR EACH ROW
  EXECUTE FUNCTION calculate_winner_engagement_rate();

-- Calculate performance score (weighted)
CREATE OR REPLACE FUNCTION calculate_winner_performance_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Score formula: weighted combination of metrics
  -- Engagement rate (40%) + Retention (30%) + Relative views (30%)
  NEW.performance_score := LEAST(10, GREATEST(1,
    (COALESCE(NEW.engagement_rate, 0) / 2) * 0.4 + -- Engagement: 20% = 10 points
    (COALESCE(NEW.retention_full, 0) / 10) * 0.3 + -- Retention: 100% = 10 points
    (LEAST(10, LOG(GREATEST(1, COALESCE(NEW.views, 0))) / 1.5)) * 0.3 -- Views: log scale
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_winners_bank_score ON public.winners_bank;
CREATE TRIGGER trigger_winners_bank_score
  BEFORE INSERT OR UPDATE ON public.winners_bank
  FOR EACH ROW
  EXECUTE FUNCTION calculate_winner_performance_score();

-- ============================================================================
-- DATA MIGRATION: Migrate existing is_winner scripts to winners_bank
-- ============================================================================

INSERT INTO public.winners_bank (
  user_id,
  source_type,
  script_id,
  hook_text,
  content_format,
  created_at
)
SELECT
  s.user_id,
  'our_script',
  s.id,
  s.hook_line,
  s.content_type,
  s.created_at
FROM public.scripts s
WHERE s.is_winner = TRUE
  AND s.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate saved_skits marked as winners
INSERT INTO public.winners_bank (
  user_id,
  source_type,
  skit_id,
  hook_text,
  product_name,
  created_at
)
SELECT
  ss.user_id,
  'our_script',
  ss.id,
  (ss.skit_data->>'hook_line')::TEXT,
  ss.product_name,
  ss.created_at
FROM public.saved_skits ss
WHERE ss.is_winner = TRUE
  AND ss.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.winners_bank wb WHERE wb.skit_id = ss.id
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- DEPRECATION COMMENTS
-- After migration is verified, these columns should stop being used
-- ============================================================================

COMMENT ON COLUMN public.scripts.is_winner IS 'DEPRECATED: Use winners_bank table instead. Do not use for new code.';
COMMENT ON COLUMN public.saved_skits.is_winner IS 'DEPRECATED: Use winners_bank table instead. Do not use for new code.';

-- Documentation
COMMENT ON TABLE public.winners_bank IS 'Unified Winners Bank: stores both our successful scripts and external reference videos for pattern learning';
COMMENT ON TABLE public.winner_patterns IS 'Aggregated patterns from winners_bank, updated periodically for performance';
