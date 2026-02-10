-- Migration 093: Competitor Tracking
-- Purpose: Track competitor TikTok accounts and analyze their content patterns

-- ============================================================================
-- COMPETITORS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Competitor details
  name TEXT NOT NULL,
  tiktok_handle TEXT NOT NULL,
  category TEXT,
  notes TEXT,

  -- Aggregated stats (updated periodically)
  total_videos_tracked INTEGER DEFAULT 0,
  avg_views BIGINT DEFAULT 0,
  avg_engagement DECIMAL(5,2) DEFAULT 0,
  top_hook_pattern TEXT,

  -- Tracking
  last_checked_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitors_user ON public.competitors(user_id);
CREATE INDEX IF NOT EXISTS idx_competitors_handle ON public.competitors(user_id, tiktok_handle);

-- RLS
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own competitors" ON public.competitors;
CREATE POLICY "Users can manage own competitors" ON public.competitors
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- COMPETITOR VIDEOS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.competitor_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE NOT NULL,

  -- Video details
  tiktok_url TEXT NOT NULL,
  title TEXT,
  hook_text TEXT,
  content_type TEXT,

  -- Performance
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2),

  -- Analysis
  ai_analysis JSONB,

  -- Metadata
  spotted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_videos_competitor ON public.competitor_videos(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_videos_views ON public.competitor_videos(competitor_id, views DESC);

-- RLS
ALTER TABLE public.competitor_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view competitor videos" ON public.competitor_videos;
CREATE POLICY "Users can view competitor videos" ON public.competitor_videos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.competitors
      WHERE competitors.id = competitor_videos.competitor_id
        AND competitors.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert competitor videos" ON public.competitor_videos;
CREATE POLICY "Users can insert competitor videos" ON public.competitor_videos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.competitors
      WHERE competitors.id = competitor_videos.competitor_id
        AND competitors.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update competitor videos" ON public.competitor_videos;
CREATE POLICY "Users can update competitor videos" ON public.competitor_videos
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.competitors
      WHERE competitors.id = competitor_videos.competitor_id
        AND competitors.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete competitor videos" ON public.competitor_videos;
CREATE POLICY "Users can delete competitor videos" ON public.competitor_videos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.competitors
      WHERE competitors.id = competitor_videos.competitor_id
        AND competitors.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update competitor stats when videos are added/updated
CREATE OR REPLACE FUNCTION update_competitor_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.competitors
  SET
    total_videos_tracked = (
      SELECT COUNT(*) FROM public.competitor_videos
      WHERE competitor_id = NEW.competitor_id
    ),
    avg_views = (
      SELECT COALESCE(AVG(views), 0)::BIGINT FROM public.competitor_videos
      WHERE competitor_id = NEW.competitor_id
    ),
    avg_engagement = (
      SELECT COALESCE(AVG(
        CASE
          WHEN views > 0 THEN ((likes + comments + shares)::DECIMAL / views) * 100
          ELSE 0
        END
      ), 0)
      FROM public.competitor_videos
      WHERE competitor_id = NEW.competitor_id AND views > 0
    ),
    updated_at = NOW()
  WHERE id = NEW.competitor_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_competitor_stats ON public.competitor_videos;
CREATE TRIGGER trigger_update_competitor_stats
  AFTER INSERT OR UPDATE OF views, likes, comments, shares ON public.competitor_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_competitor_stats();

-- Calculate engagement rate for competitor videos
CREATE OR REPLACE FUNCTION calc_competitor_engagement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.views > 0 THEN
    NEW.engagement_rate := ((NEW.likes + NEW.comments + NEW.shares)::DECIMAL / NEW.views) * 100;
  ELSE
    NEW.engagement_rate := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calc_competitor_engagement ON public.competitor_videos;
CREATE TRIGGER trigger_calc_competitor_engagement
  BEFORE INSERT OR UPDATE OF views, likes, comments, shares ON public.competitor_videos
  FOR EACH ROW
  EXECUTE FUNCTION calc_competitor_engagement();

COMMENT ON TABLE public.competitors IS 'Tracked TikTok competitor accounts for pattern analysis';
COMMENT ON TABLE public.competitor_videos IS 'Individual videos from tracked competitors';
