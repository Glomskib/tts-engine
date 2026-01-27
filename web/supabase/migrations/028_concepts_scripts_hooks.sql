-- Migration 028: Concepts columns, Script Library, Proven Hooks
-- Purpose: Fix concepts schema, add script library for reuse, track proven hooks with stats

-- ============================================================================
-- PART A: Fix concepts table - add missing columns
-- ============================================================================

-- Angle and proof type
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS angle text;
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS proof_type text;
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS hypothesis text;
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS hook_options text[];

-- Hook package fields
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS visual_hook text;
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS on_screen_text_hook text;
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS on_screen_text_mid text[];
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS on_screen_text_cta text;
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS hook_type text;

-- Reference data
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS reference_script text;
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS reference_video_url text;
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS tone_preset text;

-- ============================================================================
-- PART B: Script Library - proven/approved scripts for reuse
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.script_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  -- Context
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  brand_name text NOT NULL,
  concept_id uuid NULL REFERENCES public.concepts(id) ON DELETE SET NULL,
  source_video_id uuid NULL REFERENCES public.videos(id) ON DELETE SET NULL,

  -- Script content
  script_text text NOT NULL,
  script_hash text NOT NULL, -- For deduplication

  -- Hook details (captured at time of save)
  hook_spoken text,
  hook_visual text,
  hook_text text,
  hook_family text,
  tone_preset text,

  -- Stats
  is_winner boolean DEFAULT false NOT NULL,
  used_count integer DEFAULT 0 NOT NULL,
  approved_count integer DEFAULT 0 NOT NULL,
  posted_count integer DEFAULT 0 NOT NULL,

  -- Audit
  approved_by text NULL
);

-- Indexes for script library
CREATE INDEX IF NOT EXISTS idx_script_library_product
  ON public.script_library(product_id);

CREATE INDEX IF NOT EXISTS idx_script_library_brand
  ON public.script_library(brand_name);

CREATE INDEX IF NOT EXISTS idx_script_library_winner
  ON public.script_library(is_winner, posted_count DESC)
  WHERE is_winner = true;

-- Unique constraint on script hash per brand (prevent exact duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_script_library_unique_hash
  ON public.script_library(brand_name, script_hash);

-- ============================================================================
-- PART C: Proven Hooks - track hooks with usage stats
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.proven_hooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  -- Context
  brand_name text NOT NULL,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,

  -- Hook content
  hook_type text NOT NULL CHECK (hook_type IN ('spoken', 'visual', 'text')),
  hook_text text NOT NULL,
  hook_hash text NOT NULL, -- For deduplication and lookup
  hook_family text CHECK (hook_family IN (
    'pattern_interrupt', 'relatable_pain', 'proof_teaser',
    'contrarian', 'mini_story', 'curiosity_gap'
  )),

  -- Source tracking
  source_video_id uuid NULL REFERENCES public.videos(id) ON DELETE SET NULL,

  -- Stats
  used_count integer DEFAULT 1 NOT NULL,
  approved_count integer DEFAULT 0 NOT NULL,
  posted_count integer DEFAULT 0 NOT NULL,
  winner_count integer DEFAULT 0 NOT NULL,

  -- Computed score (higher = better)
  -- score = approved_count * 2 + posted_count * 5 + winner_count * 20 - (used_count - approved_count) * 0.5
  -- Updated by trigger or app logic

  -- Audit
  last_used_at timestamptz DEFAULT now(),
  approved_by text NULL
);

-- Indexes for proven hooks
CREATE INDEX IF NOT EXISTS idx_proven_hooks_brand
  ON public.proven_hooks(brand_name);

CREATE INDEX IF NOT EXISTS idx_proven_hooks_product
  ON public.proven_hooks(product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proven_hooks_type
  ON public.proven_hooks(hook_type, brand_name);

CREATE INDEX IF NOT EXISTS idx_proven_hooks_family
  ON public.proven_hooks(hook_family)
  WHERE hook_family IS NOT NULL;

-- For finding best hooks by stats
CREATE INDEX IF NOT EXISTS idx_proven_hooks_stats
  ON public.proven_hooks(brand_name, winner_count DESC, posted_count DESC);

-- Unique constraint: one hook text per brand+type
CREATE UNIQUE INDEX IF NOT EXISTS idx_proven_hooks_unique
  ON public.proven_hooks(brand_name, hook_type, hook_hash);

-- ============================================================================
-- PART D: Link scripts to videos (track which script was used)
-- ============================================================================

-- Add script_library reference to videos
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS script_library_id uuid
  REFERENCES public.script_library(id) ON DELETE SET NULL;

-- Index for finding videos that used a script
CREATE INDEX IF NOT EXISTS idx_videos_script_library
  ON public.videos(script_library_id)
  WHERE script_library_id IS NOT NULL;

-- ============================================================================
-- PART E: Update timestamp triggers
-- ============================================================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to script_library
DROP TRIGGER IF EXISTS update_script_library_updated_at ON public.script_library;
CREATE TRIGGER update_script_library_updated_at
  BEFORE UPDATE ON public.script_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply to proven_hooks
DROP TRIGGER IF EXISTS update_proven_hooks_updated_at ON public.proven_hooks;
CREATE TRIGGER update_proven_hooks_updated_at
  BEFORE UPDATE ON public.proven_hooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
