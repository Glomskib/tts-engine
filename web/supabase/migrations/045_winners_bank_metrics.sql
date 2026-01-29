-- Migration 045: Add metrics, AI analysis, and metadata to Winners Bank
-- Purpose: Store video metrics, AI analysis, and oEmbed metadata on reference_videos

-- Add metric columns
ALTER TABLE public.reference_videos
  ADD COLUMN IF NOT EXISTS views bigint,
  ADD COLUMN IF NOT EXISTS likes bigint,
  ADD COLUMN IF NOT EXISTS comments bigint,
  ADD COLUMN IF NOT EXISTS shares bigint,
  ADD COLUMN IF NOT EXISTS transcript_text text,
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS creator_handle text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- Add index for transcript search
CREATE INDEX IF NOT EXISTS idx_reference_videos_transcript ON public.reference_videos USING gin(to_tsvector('english', COALESCE(transcript_text, '')));

-- Add comment
COMMENT ON COLUMN public.reference_videos.views IS 'Video view count from TikTok';
COMMENT ON COLUMN public.reference_videos.likes IS 'Video like count from TikTok';
COMMENT ON COLUMN public.reference_videos.comments IS 'Video comment count from TikTok';
COMMENT ON COLUMN public.reference_videos.shares IS 'Video share count from TikTok';
COMMENT ON COLUMN public.reference_videos.transcript_text IS 'Video transcript (convenience copy from reference_assets)';
COMMENT ON COLUMN public.reference_videos.ai_analysis IS 'AI-generated analysis of the video (hook style, format, etc)';
COMMENT ON COLUMN public.reference_videos.title IS 'Video title from oEmbed or manual entry';
COMMENT ON COLUMN public.reference_videos.creator_handle IS 'TikTok creator handle (from oEmbed)';
COMMENT ON COLUMN public.reference_videos.thumbnail_url IS 'Video thumbnail URL (from oEmbed)';
