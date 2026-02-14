-- ============================================
-- Content Report Cards — Weekly AI Performance Reviews
-- ============================================

CREATE TABLE IF NOT EXISTS public.content_report_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Period
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,

  -- Metrics (this week)
  total_views BIGINT DEFAULT 0,
  total_likes BIGINT DEFAULT 0,
  total_comments BIGINT DEFAULT 0,
  total_shares BIGINT DEFAULT 0,
  videos_published INTEGER DEFAULT 0,
  engagement_rate NUMERIC(5,2) DEFAULT 0,

  -- Comparisons (vs previous week)
  views_change_pct NUMERIC(6,2),
  likes_change_pct NUMERIC(6,2),
  engagement_change_pct NUMERIC(6,2),
  videos_change_pct NUMERIC(6,2),

  -- Best / worst
  best_video_id UUID REFERENCES public.tiktok_videos(id) ON DELETE SET NULL,
  best_video_title TEXT,
  best_video_views BIGINT,
  worst_video_id UUID REFERENCES public.tiktok_videos(id) ON DELETE SET NULL,
  worst_video_title TEXT,
  worst_video_views BIGINT,

  -- AI-generated insights
  grade TEXT CHECK (grade IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F')),
  ai_summary TEXT,
  wins JSONB DEFAULT '[]',
  improvements JSONB DEFAULT '[]',
  tip_of_the_week TEXT,

  -- Meta
  ai_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, week_start)
);

CREATE INDEX idx_report_cards_user ON content_report_cards(user_id, week_start DESC);

ALTER TABLE content_report_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own report cards" ON content_report_cards FOR ALL USING (auth.uid() = user_id);

COMMENT ON TABLE content_report_cards IS 'Weekly AI-powered performance reviews for creator content';
