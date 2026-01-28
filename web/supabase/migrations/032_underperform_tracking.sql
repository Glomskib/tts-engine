-- Migration: Add underperform tracking for hooks and scripts
-- This enables a third outcome state for creative performance feedback

-- =============================================================================
-- A) Add underperform_count to proven_hooks
-- =============================================================================
ALTER TABLE public.proven_hooks
ADD COLUMN IF NOT EXISTS underperform_count integer DEFAULT 0 NOT NULL;

-- Index for scoring queries (include underperform in composite)
CREATE INDEX IF NOT EXISTS idx_proven_hooks_performance
ON public.proven_hooks (brand_name, approved_count DESC, underperform_count, rejected_count);

-- =============================================================================
-- B) Add underperform_count to script_library
-- =============================================================================
ALTER TABLE public.script_library
ADD COLUMN IF NOT EXISTS underperform_count integer DEFAULT 0 NOT NULL;

-- =============================================================================
-- C) Create hook_feedback table for granular tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.hook_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Reference to the hook
  hook_id uuid NOT NULL REFERENCES public.proven_hooks(id) ON DELETE CASCADE,

  -- Context (denormalized for query performance)
  brand_name text NOT NULL,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,

  -- Outcome: winner (positive), underperform (soft negative), rejected (hard negative)
  outcome text NOT NULL CHECK (outcome IN ('winner', 'underperform', 'rejected')),

  -- Optional reason code for learning
  reason_code text NULL,

  -- Optional notes (not required)
  notes text NULL,

  -- Source of feedback
  source text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'performance', 'auto')),

  -- Who gave the feedback
  created_by text NULL
);

-- Indexes for hook_feedback
CREATE INDEX IF NOT EXISTS idx_hook_feedback_hook ON public.hook_feedback (hook_id);
CREATE INDEX IF NOT EXISTS idx_hook_feedback_brand ON public.hook_feedback (brand_name);
CREATE INDEX IF NOT EXISTS idx_hook_feedback_outcome ON public.hook_feedback (outcome);
CREATE INDEX IF NOT EXISTS idx_hook_feedback_product ON public.hook_feedback (product_id) WHERE product_id IS NOT NULL;

-- =============================================================================
-- D) Create script_feedback table for granular tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.script_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Reference to the script (script_library entry)
  script_id uuid NOT NULL REFERENCES public.script_library(id) ON DELETE CASCADE,

  -- Context (denormalized for query performance)
  brand_name text NOT NULL,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,

  -- Outcome: winner (positive), underperform (soft negative), rejected (hard negative)
  outcome text NOT NULL CHECK (outcome IN ('winner', 'underperform', 'rejected')),

  -- Optional reason code for learning
  reason_code text NULL,

  -- Optional notes (not required)
  notes text NULL,

  -- Source of feedback
  source text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'performance', 'auto')),

  -- Who gave the feedback
  created_by text NULL
);

-- Indexes for script_feedback
CREATE INDEX IF NOT EXISTS idx_script_feedback_script ON public.script_feedback (script_id);
CREATE INDEX IF NOT EXISTS idx_script_feedback_brand ON public.script_feedback (brand_name);
CREATE INDEX IF NOT EXISTS idx_script_feedback_outcome ON public.script_feedback (outcome);
CREATE INDEX IF NOT EXISTS idx_script_feedback_product ON public.script_feedback (product_id) WHERE product_id IS NOT NULL;

-- =============================================================================
-- E) Reason codes reference (common underperform reasons)
-- =============================================================================
COMMENT ON TABLE public.hook_feedback IS
'Tracks granular feedback on hooks. Common reason_codes for underperform:
- low_engagement: Hook did not capture attention
- weak_cta: Call to action was not compelling
- wrong_tone: Tone did not match audience
- too_generic: Not specific enough to product/brand
- poor_timing: Pacing or delivery issues
- saturated: Overused pattern in market';

COMMENT ON TABLE public.script_feedback IS
'Tracks granular feedback on scripts. Common reason_codes for underperform:
- low_retention: Users dropped off early
- weak_middle: Middle section lost engagement
- unclear_value: Value proposition not clear
- wrong_length: Too long or too short
- poor_flow: Transitions were jarring
- missed_proof: Lacked social proof or credibility';
