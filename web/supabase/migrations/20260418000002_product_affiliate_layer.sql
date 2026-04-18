-- ============================================================
-- Product / affiliate layer: one product per run, plus hook +
-- alt-caption fields and a copies_made counter on rendered clips.
-- Lightweight — all fields nullable, no new tables required.
-- ============================================================

-- 1. Per-run product attachment (one product per run).
ALTER TABLE public.ve_runs
  ADD COLUMN IF NOT EXISTS product_name        TEXT,
  ADD COLUMN IF NOT EXISTS product_url         TEXT,
  ADD COLUMN IF NOT EXISTS product_platform    TEXT,
  ADD COLUMN IF NOT EXISTS product_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS coupon_code         TEXT;

CREATE INDEX IF NOT EXISTS idx_ve_runs_product_platform
  ON public.ve_runs (product_platform)
  WHERE product_platform IS NOT NULL;

COMMENT ON COLUMN public.ve_runs.product_platform IS
  'Freeform platform tag: tiktok_shop, amazon, shopify, etsy, custom, ...';

-- 2. Extra copy outputs + lightweight tracking on each rendered clip.
ALTER TABLE public.ve_rendered_clips
  ADD COLUMN IF NOT EXISTS hook_line     TEXT,
  ADD COLUMN IF NOT EXISTS alt_captions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS copies_made   INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ve_rendered_clips.hook_line IS
  'Short opening line (<= 12 words) for the on-screen / spoken hook.';
COMMENT ON COLUMN public.ve_rendered_clips.alt_captions IS
  'Array of 1-2 alternate caption variants for the creator to swap in.';
COMMENT ON COLUMN public.ve_rendered_clips.copies_made IS
  'Increments each time the user copies caption/hook/link from this clip.';

-- 3. Atomic counter bump (called from /api/video-engine/clips/[id]/copy).
CREATE OR REPLACE FUNCTION public.ve_increment_clip_copies(p_clip_id UUID)
RETURNS public.ve_rendered_clips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_out public.ve_rendered_clips;
BEGIN
  UPDATE public.ve_rendered_clips
    SET copies_made = copies_made + 1
    WHERE id = p_clip_id
    RETURNING * INTO row_out;
  RETURN row_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ve_increment_clip_copies(UUID) TO service_role;
