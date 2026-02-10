-- Migration 097: A/B Test Variations with video linking and performance tracking
-- Extends existing ab_tests (migration 087) with per-variation video performance

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
  -- Performance (synced from video stats)
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2) DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_variations_test ON ab_test_variations(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_variations_video ON ab_test_variations(video_id);

ALTER TABLE ab_test_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage variations via test ownership" ON ab_test_variations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM ab_tests WHERE ab_tests.id = ab_test_variations.test_id AND ab_tests.user_id = auth.uid())
  );

CREATE POLICY "Service role full access variations" ON ab_test_variations
  FOR ALL USING (auth.role() = 'service_role');

-- Add winner_variation_id to ab_tests
ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS winner_variation_id UUID REFERENCES ab_test_variations(id) ON DELETE SET NULL;
ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 7;

COMMENT ON TABLE ab_test_variations IS 'Individual variations in an A/B test with linked videos and performance data';
