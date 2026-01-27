-- Migration 026: AI Hook Feedback
-- Purpose: Track hook approvals/bans for feedback loop

CREATE TABLE IF NOT EXISTS public.ai_hook_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Context (brand required, product optional for brand-wide bans)
  brand_id uuid NULL,
  brand_name text NOT NULL,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,

  -- Hook data
  hook_text text NOT NULL,
  hook_hash text NOT NULL, -- MD5 or similar for quick lookup

  -- Feedback
  rating integer NOT NULL CHECK (rating IN (-1, 1)), -- -1 = ban, 1 = approve
  reason text NULL,

  -- Audit
  created_by text NULL -- email or user id
);

-- Index for quick banned hook lookup
CREATE INDEX IF NOT EXISTS idx_hook_feedback_brand_rating
  ON public.ai_hook_feedback(brand_name, rating);

CREATE INDEX IF NOT EXISTS idx_hook_feedback_product_rating
  ON public.ai_hook_feedback(product_id, rating)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hook_feedback_hash
  ON public.ai_hook_feedback(hook_hash);

-- Prevent duplicate feedback on same hook for same brand
CREATE UNIQUE INDEX IF NOT EXISTS idx_hook_feedback_unique
  ON public.ai_hook_feedback(brand_name, hook_hash);
