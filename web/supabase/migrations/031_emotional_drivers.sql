-- Migration 031: Emotional Drivers and AUTO Hook System
-- Purpose: Add emotional driver categorization, rejection tracking, and selected hook package fields

-- =====================================================
-- PART 1: Extend proven_hooks table
-- =====================================================

-- Add emotional_driver enum column
ALTER TABLE public.proven_hooks ADD COLUMN IF NOT EXISTS emotional_driver text
  CHECK (emotional_driver IN ('shock', 'fear', 'curiosity', 'insecurity', 'fomo'));

-- Add CTA family tracking
ALTER TABLE public.proven_hooks ADD COLUMN IF NOT EXISTS cta_family text;

-- Add rejected_count for quarantine logic (auto-exclude after 3 rejections)
ALTER TABLE public.proven_hooks ADD COLUMN IF NOT EXISTS rejected_count integer DEFAULT 0 NOT NULL;

-- Add source tracking (internal = AI generated, external = Winners Bank reference)
ALTER TABLE public.proven_hooks ADD COLUMN IF NOT EXISTS source text DEFAULT 'internal'
  CHECK (source IN ('internal', 'external'));

-- Add edge_push flag for hooks that push boundaries
ALTER TABLE public.proven_hooks ADD COLUMN IF NOT EXISTS edge_push boolean DEFAULT false;

-- Index for emotional driver queries and scoring
CREATE INDEX IF NOT EXISTS idx_proven_hooks_emotional_driver
  ON public.proven_hooks(brand_name, emotional_driver)
  WHERE emotional_driver IS NOT NULL;

-- Index for quarantine filtering (exclude rejected >= 3)
CREATE INDEX IF NOT EXISTS idx_proven_hooks_not_quarantined
  ON public.proven_hooks(brand_name, hook_type)
  WHERE rejected_count < 3;

-- =====================================================
-- PART 2: Add selected hook package fields to videos
-- =====================================================

-- Selected spoken hook (the final chosen hook text)
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS selected_spoken_hook text;

-- Selected visual hook
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS selected_visual_hook text;

-- Selected on-screen text hook
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS selected_on_screen_hook text;

-- Selected emotional driver
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS selected_emotional_driver text
  CHECK (selected_emotional_driver IS NULL OR selected_emotional_driver IN ('shock', 'fear', 'curiosity', 'insecurity', 'fomo'));

-- Selected CTA overlay text
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS selected_cta_overlay text;

-- Selected CTA family
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS selected_cta_family text;

-- =====================================================
-- PART 3: Add rejection reason tracking to video_events
-- =====================================================

-- The video_events table already has a 'details' jsonb column that can store rejection reasons
-- No schema change needed - we'll store { reason_tags: ['too_generic', 'compliance'] } in details

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN public.proven_hooks.emotional_driver IS 'Primary emotional driver: shock, fear, curiosity, insecurity, fomo';
COMMENT ON COLUMN public.proven_hooks.rejected_count IS 'Number of times this hook was rejected. Auto-quarantine at 3+';
COMMENT ON COLUMN public.proven_hooks.edge_push IS 'True if this hook pushes boundaries (slightly controversial)';
COMMENT ON COLUMN public.proven_hooks.source IS 'internal = AI generated, external = from Winners Bank';

COMMENT ON COLUMN public.videos.selected_spoken_hook IS 'Final chosen spoken hook for this video';
COMMENT ON COLUMN public.videos.selected_emotional_driver IS 'Emotional driver of the selected hook';
