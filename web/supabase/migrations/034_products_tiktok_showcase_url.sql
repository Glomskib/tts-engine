-- Migration: Add tiktok_showcase_url to products table
-- This stores the TikTok Shop showcase URL for a product

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS tiktok_showcase_url text;

COMMENT ON COLUMN public.products.tiktok_showcase_url IS
'TikTok Shop showcase URL for this product';

-- Also add slug if not exists (for URL-friendly identifiers)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS slug text;

COMMENT ON COLUMN public.products.slug IS
'URL-friendly identifier for the product';
