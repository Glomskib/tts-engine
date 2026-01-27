-- Migration 027: Video Code
-- Purpose: Add human-friendly video code (BRAND-SKU-YYMMDD-###)

-- Add video_code column to videos table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'video_code') THEN
    ALTER TABLE public.videos ADD COLUMN video_code text;
  END IF;
END $$;

-- Create unique index on video_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_video_code
  ON public.videos(video_code)
  WHERE video_code IS NOT NULL;

-- Create index for sequence lookup (brand via product, product_id, date)
-- This helps with finding the next sequence number efficiently
CREATE INDEX IF NOT EXISTS idx_videos_code_sequence
  ON public.videos(product_id, created_at DESC);

-- Add slug column to products if not exists (for SKU part of code)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'slug') THEN
    ALTER TABLE public.products ADD COLUMN slug text;
  END IF;
END $$;

-- Create index on product slug
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
