-- Migration 045: Add metrics and AI analysis to Winners Bank
-- Purpose: Store video metrics and AI analysis directly on reference_videos for convenience

-- Add metric columns
ALTER TABLE public.reference_videos
  ADD COLUMN IF NOT EXISTS views bigint,
  ADD COLUMN IF NOT EXISTS likes bigint,
  ADD COLUMN IF NOT EXISTS comments bigint,
  ADD COLUMN IF NOT EXISTS shares bigint,
  ADD COLUMN IF NOT EXISTS transcript_text text,
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb;

-- Add index for transcript search
CREATE INDEX IF NOT EXISTS idx_reference_videos_transcript ON public.reference_videos USING gin(to_tsvector('english', COALESCE(transcript_text, '')));

-- Add comment
COMMENT ON COLUMN public.reference_videos.views IS 'Video view count from TikTok';
COMMENT ON COLUMN public.reference_videos.likes IS 'Video like count from TikTok';
COMMENT ON COLUMN public.reference_videos.comments IS 'Video comment count from TikTok';
COMMENT ON COLUMN public.reference_videos.shares IS 'Video share count from TikTok';
COMMENT ON COLUMN public.reference_videos.transcript_text IS 'Video transcript (convenience copy from reference_assets)';
COMMENT ON COLUMN public.reference_videos.ai_analysis IS 'AI-generated analysis of the video (hook style, format, etc)';
