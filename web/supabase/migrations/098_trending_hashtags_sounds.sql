-- Migration 098: Trending Hashtags & Sounds Tracker

CREATE TABLE IF NOT EXISTS trending_hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  hashtag TEXT NOT NULL,
  category TEXT,
  view_count BIGINT DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  growth_rate DECIMAL(5,2) DEFAULT 0, -- percentage growth
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

-- Trending sounds
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

COMMENT ON TABLE trending_hashtags IS 'Tracked trending TikTok hashtags with growth metrics';
COMMENT ON TABLE trending_sounds IS 'Tracked trending TikTok sounds with growth metrics';
