-- TikTok Comments table + comment tracking columns on tiktok_videos
-- Stores fetched comment text with sentiment analysis for personalization engine

CREATE TABLE IF NOT EXISTS public.tiktok_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tiktok_video_id TEXT NOT NULL,
  tiktok_comment_id TEXT NOT NULL,
  parent_comment_id TEXT,
  text TEXT NOT NULL,
  like_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  create_time BIGINT,
  sentiment TEXT CHECK (sentiment IN ('positive','negative','neutral','question')),
  sentiment_score NUMERIC(3,2),
  topics TEXT[] DEFAULT '{}',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tiktok_comment_id)
);

CREATE INDEX idx_tiktok_comments_video ON tiktok_comments(user_id, tiktok_video_id);

ALTER TABLE tiktok_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own comments" ON tiktok_comments
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access comments" ON tiktok_comments
  FOR ALL USING (auth.role() = 'service_role');

-- Add comment tracking columns to tiktok_videos
ALTER TABLE public.tiktok_videos
  ADD COLUMN IF NOT EXISTS comments_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comment_sentiment_summary JSONB;
