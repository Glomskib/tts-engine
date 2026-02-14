-- Migration 125: Add TikTok Shop source fields to products
-- Purpose: Track which products came from TikTok Shop and link back to them

-- TikTok Shop product ID for linking videos to products on TikTok
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tiktok_product_id TEXT;

-- Source of the product: 'manual' (default), 'tiktok_shop', 'import', etc.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Index for fast lookup by tiktok_product_id
CREATE INDEX IF NOT EXISTS idx_products_tiktok_product_id
  ON public.products(tiktok_product_id)
  WHERE tiktok_product_id IS NOT NULL;

-- Index for filtering by source
CREATE INDEX IF NOT EXISTS idx_products_source
  ON public.products(source)
  WHERE source != 'manual';

COMMENT ON COLUMN public.products.tiktok_product_id IS 'TikTok Shop product ID for linking content to TikTok products';
COMMENT ON COLUMN public.products.source IS 'Where this product came from: manual, tiktok_shop, import';
