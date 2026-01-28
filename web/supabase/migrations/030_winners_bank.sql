-- Migration 030: Winners Bank
-- Purpose: Create reference_videos system for storing winning TikTok examples
-- and extracting hook patterns for AI context

-- Create reference_videos table
CREATE TABLE IF NOT EXISTS public.reference_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  submitted_by text NOT NULL, -- email or user id
  notes text,
  category text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'needs_file', 'needs_transcription', 'processing', 'ready', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique index on URL to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_reference_videos_url ON public.reference_videos(url);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_reference_videos_status ON public.reference_videos(status);
CREATE INDEX IF NOT EXISTS idx_reference_videos_category ON public.reference_videos(category);
CREATE INDEX IF NOT EXISTS idx_reference_videos_created ON public.reference_videos(created_at DESC);

-- Create reference_assets table
CREATE TABLE IF NOT EXISTS public.reference_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_video_id uuid NOT NULL REFERENCES public.reference_videos(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('mp4', 'audio', 'transcript')),
  storage_path text, -- for uploaded files
  transcript_text text, -- for pasted or extracted transcripts
  created_at timestamptz DEFAULT now()
);

-- Create index for lookups by reference_video_id
CREATE INDEX IF NOT EXISTS idx_reference_assets_video ON public.reference_assets(reference_video_id);

-- Create reference_extracts table (one per reference_video)
CREATE TABLE IF NOT EXISTS public.reference_extracts (
  reference_video_id uuid PRIMARY KEY REFERENCES public.reference_videos(id) ON DELETE CASCADE,
  spoken_hook text NOT NULL,
  on_screen_hook text,
  visual_hook text,
  cta text NOT NULL,
  hook_family text NOT NULL,
  structure_tags jsonb,
  quality_score int NOT NULL DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),
  created_at timestamptz DEFAULT now()
);

-- Create index for quality-based queries
CREATE INDEX IF NOT EXISTS idx_reference_extracts_quality ON public.reference_extracts(quality_score DESC);

-- Create trigger to update updated_at on reference_videos
CREATE OR REPLACE FUNCTION update_reference_videos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reference_videos_updated_at ON public.reference_videos;
CREATE TRIGGER trigger_reference_videos_updated_at
  BEFORE UPDATE ON public.reference_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_reference_videos_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.reference_videos IS 'Winners Bank: stores TikTok reference videos for hook/CTA extraction';
COMMENT ON TABLE public.reference_assets IS 'Assets (files, transcripts) associated with reference videos';
COMMENT ON TABLE public.reference_extracts IS 'AI-extracted hook package, CTA, and structure from reference videos';
