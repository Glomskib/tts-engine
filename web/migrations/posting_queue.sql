-- Migration: Create posting_queue table for Feature 4 (Social Media Posting Queue)
-- Run this in Supabase SQL Editor after deploying the new code

CREATE TABLE IF NOT EXISTS posting_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube_shorts', 'youtube_long', 'instagram', 'twitter')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted', 'failed')),
  script_id UUID REFERENCES saved_skits(id),
  video_id UUID REFERENCES videos(id),
  caption TEXT,
  hashtags TEXT[],
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  posted_url TEXT,
  platform_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_posting_queue_user ON posting_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_posting_queue_status ON posting_queue(status);
CREATE INDEX IF NOT EXISTS idx_posting_queue_scheduled ON posting_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_posting_queue_platform ON posting_queue(platform);
CREATE INDEX IF NOT EXISTS idx_posting_queue_created ON posting_queue(created_at);

-- Enable Row Level Security
ALTER TABLE posting_queue ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: Users can only access their own posts
CREATE POLICY "Users manage own posts" ON posting_queue
  FOR ALL USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_posting_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posting_queue_updated_at
  BEFORE UPDATE ON posting_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_posting_queue_updated_at();
