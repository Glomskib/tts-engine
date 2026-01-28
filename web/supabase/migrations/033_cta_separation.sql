-- Migration: Separate CTA into distinct fields and add product display name
-- This clarifies the distinction between:
-- 1. Product Display Name (TikTok-safe product naming)
-- 2. CTA Script Line (persuasive spoken/written copy)
-- 3. CTA Overlay (mechanical final action only)

-- =============================================================================
-- A) Add product_display_name to products table
-- =============================================================================
-- This is a short, TikTok-compliant product name (max 30 chars)
-- Used in UI, links, and references - NOT a CTA or hook
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_display_name text;

-- Add constraint for max length (enforced at app level too)
-- Note: PostgreSQL doesn't have a simple max length constraint for text,
-- so we'll enforce this in the application layer

COMMENT ON COLUMN public.products.product_display_name IS
'TikTok-safe product name (max 30 chars). Letters, numbers, spaces only. No emojis, prices, or medical claims.';

-- =============================================================================
-- B) Add cta_script to videos table
-- =============================================================================
-- This is the persuasive CTA copy (1-2 sentences with urgency/scarcity)
-- Belongs in the script body, NOT the overlay
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS cta_script text;

COMMENT ON COLUMN public.videos.cta_script IS
'Persuasive CTA script line (1-2 sentences). Uses urgency, scarcity, popularity. TikTok compliant.';

-- =============================================================================
-- C) Add cta_script_options to concepts for AI generation
-- =============================================================================
ALTER TABLE public.concepts
ADD COLUMN IF NOT EXISTS cta_script_options text[];

COMMENT ON COLUMN public.concepts.cta_script_options IS
'AI-generated CTA script line options for selection.';

-- =============================================================================
-- D) Rename/clarify existing cta_overlay comment
-- =============================================================================
-- The existing selected_cta_overlay should be mechanical only (2-6 words)
COMMENT ON COLUMN public.videos.selected_cta_overlay IS
'Mechanical CTA overlay (2-6 words). Final action only: "Tap the orange cart", "Link in bio". No hype, no product names.';

-- =============================================================================
-- E) Add product_display_name_options to concepts for AI generation
-- =============================================================================
ALTER TABLE public.concepts
ADD COLUMN IF NOT EXISTS product_display_name_options text[];

COMMENT ON COLUMN public.concepts.product_display_name_options IS
'AI-generated TikTok-safe product name options (max 30 chars each).';
