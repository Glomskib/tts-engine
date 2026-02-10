-- Migration 102: A/B Test Variations, Trending Hashtags/Sounds, Video Revenue columns

-- ============================================================================
-- A/B TEST VARIATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS ab_test_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Variation',
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  skit_id UUID REFERENCES saved_skits(id) ON DELETE SET NULL,
  hook_text TEXT,
  script_preview TEXT,
  account_id UUID REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
  posting_time TIMESTAMPTZ,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2) DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_variations_test ON ab_test_variations(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_variations_video ON ab_test_variations(video_id);

ALTER TABLE ab_test_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage variations via test ownership" ON ab_test_variations
  FOR ALL USING (EXISTS (SELECT 1 FROM ab_tests WHERE ab_tests.id = ab_test_variations.test_id AND ab_tests.user_id = auth.uid()));
CREATE POLICY "Service role full access variations" ON ab_test_variations
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS winner_variation_id UUID REFERENCES ab_test_variations(id) ON DELETE SET NULL;
ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 7;

-- ============================================================================
-- TRENDING HASHTAGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS trending_hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  hashtag TEXT NOT NULL,
  category TEXT,
  view_count BIGINT DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  growth_rate DECIMAL(5,2) DEFAULT 0,
  spotted_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trending_hashtags_user ON trending_hashtags(user_id);
CREATE INDEX IF NOT EXISTS idx_trending_hashtags_growth ON trending_hashtags(growth_rate DESC);

ALTER TABLE trending_hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own hashtags" ON trending_hashtags
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access hashtags" ON trending_hashtags
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- TRENDING SOUNDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS trending_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sound_name TEXT NOT NULL,
  sound_url TEXT,
  creator TEXT,
  video_count INTEGER DEFAULT 0,
  growth_rate DECIMAL(5,2) DEFAULT 0,
  spotted_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trending_sounds_user ON trending_sounds(user_id);
CREATE INDEX IF NOT EXISTS idx_trending_sounds_growth ON trending_sounds(growth_rate DESC);

ALTER TABLE trending_sounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sounds" ON trending_sounds
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access sounds" ON trending_sounds
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- VIDEO REVENUE COLUMNS
-- ============================================================================

ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS estimated_revenue DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS actual_revenue DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS production_cost DECIMAL(10,2) DEFAULT 0;
