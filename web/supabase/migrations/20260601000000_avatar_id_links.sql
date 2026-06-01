-- ════════════════════════════════════════════════════════════════════
-- Bridge 1 — Avatar ↔ Content Linkage
--
-- Purpose: enable per-avatar attribution for both content pipeline rows
-- (content_items) and Claude-analyzed winners (winners_bank), so the
-- existing auto-post machinery can pick up avatar-rendered videos and
-- per-avatar winning patterns are queryable.
--
-- Uses brand_profile_id (not avatar_id) because brand_profiles is the
-- actual table; the app side already filters is_avatar = true.
--
-- Idempotent. No destructive ops.
-- ════════════════════════════════════════════════════════════════════

-- ─── content_items ──────────────────────────────────────────────────
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS brand_profile_id UUID
    REFERENCES public.brand_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_items_brand_profile_idx
  ON public.content_items(brand_profile_id)
  WHERE brand_profile_id IS NOT NULL;

COMMENT ON COLUMN public.content_items.brand_profile_id IS
  'Avatar (brand_profile where is_avatar=true) that produced this content item. Set by avatar render pipeline.';

-- ─── winners_bank ───────────────────────────────────────────────────
ALTER TABLE public.winners_bank
  ADD COLUMN IF NOT EXISTS brand_profile_id UUID
    REFERENCES public.brand_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS winners_bank_brand_profile_idx
  ON public.winners_bank(brand_profile_id)
  WHERE brand_profile_id IS NOT NULL;

COMMENT ON COLUMN public.winners_bank.brand_profile_id IS
  'Avatar (brand_profile where is_avatar=true) that produced this winner. Enables per-avatar pattern queries.';
