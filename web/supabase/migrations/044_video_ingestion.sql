-- Video Ingestion: Import TikTok winners for AI learning
-- Migration: 044_video_ingestion.sql

-- Winners/imported videos table
CREATE TABLE IF NOT EXISTS imported_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source info
  platform TEXT NOT NULL DEFAULT 'tiktok',
  platform_video_id TEXT,
  video_url TEXT NOT NULL,

  -- Content
  title TEXT,
  transcript TEXT,
  description TEXT,
  hashtags TEXT[],

  -- Performance metrics
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  engagement_rate DECIMAL(5,4),

  -- Creator info
  creator_handle TEXT,
  creator_followers INTEGER,

  -- Our analysis
  hook_line TEXT,
  hook_style TEXT,
  content_format TEXT,
  comedy_style TEXT,
  product_mentioned TEXT,
  ai_analysis JSONB,

  -- Linking
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  linked_skit_id UUID REFERENCES saved_skits(id) ON DELETE SET NULL,

  -- Metadata
  is_winner BOOLEAN DEFAULT TRUE,
  imported_by UUID REFERENCES auth.users(id),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  video_posted_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'analyzed', 'error')),
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_imported_videos_status ON imported_videos(status);
CREATE INDEX IF NOT EXISTS idx_imported_videos_platform ON imported_videos(platform);
CREATE INDEX IF NOT EXISTS idx_imported_videos_product ON imported_videos(product_id);
CREATE INDEX IF NOT EXISTS idx_imported_videos_views ON imported_videos(views DESC);
CREATE INDEX IF NOT EXISTS idx_imported_videos_engagement ON imported_videos(engagement_rate DESC);
CREATE INDEX IF NOT EXISTS idx_imported_videos_imported_by ON imported_videos(imported_by);
CREATE INDEX IF NOT EXISTS idx_imported_videos_created ON imported_videos(created_at DESC);

-- Row Level Security
ALTER TABLE imported_videos ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can manage imported videos
CREATE POLICY "Users can view imported videos"
  ON imported_videos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert imported videos"
  ON imported_videos FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update imported videos"
  ON imported_videos FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete imported videos"
  ON imported_videos FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_imported_videos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_imported_videos_updated_at ON imported_videos;
CREATE TRIGGER trigger_imported_videos_updated_at
  BEFORE UPDATE ON imported_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_imported_videos_updated_at();
