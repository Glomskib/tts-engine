-- Migration 025: AI Generation Logs + Winners Library
-- Purpose: Track AI generations to prevent repetition and build winners library

-- AI Generation Runs table
-- Stores every AI generation for no-repeat logic and analysis
CREATE TABLE IF NOT EXISTS public.ai_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Context
  brand_id uuid NULL,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  video_id uuid NULL REFERENCES public.videos(id) ON DELETE SET NULL,

  -- Request info
  nonce text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'v1',
  hook_type text,
  tone_preset text,
  target_length text,

  -- Output (full JSON for analysis)
  output_json jsonb NOT NULL,

  -- Extracted for quick query (spoken hooks from this generation)
  spoken_hooks text[] DEFAULT '{}',

  -- Meta
  ai_provider text,
  correlation_id text
);

-- Indexes for no-repeat queries
CREATE INDEX IF NOT EXISTS idx_ai_gen_product_created
  ON public.ai_generation_runs(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_gen_nonce
  ON public.ai_generation_runs(nonce);
CREATE INDEX IF NOT EXISTS idx_ai_gen_spoken_hooks
  ON public.ai_generation_runs USING gin(spoken_hooks);

-- Video Winners table
-- Marks videos as winners with performance metrics for AI reference
CREATE TABLE IF NOT EXISTS public.video_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Performance metrics at time of marking
  views integer DEFAULT 0,
  orders integer DEFAULT 0,
  clicks integer DEFAULT 0,
  ctr numeric(5,4) DEFAULT 0,
  cvr numeric(5,4) DEFAULT 0,

  -- Winner metadata
  winner_reason text,
  notes text,

  -- Reference data (what made it work)
  winning_hook text,
  winning_angle text,
  winning_script text,

  -- Admin
  marked_by text,

  UNIQUE(video_id)
);

-- Index for finding winners by product
CREATE INDEX IF NOT EXISTS idx_video_winners_video
  ON public.video_winners(video_id);

-- Add is_winner flag to videos for quick queries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'is_winner') THEN
    ALTER TABLE public.videos ADD COLUMN is_winner boolean DEFAULT false;
  END IF;
END $$;
