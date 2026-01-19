-- Ensure products table has all required columns
-- Run this in Supabase SQL Editor

-- Add missing columns if they don't exist
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_risk text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS notes text;

-- Verify the table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'products';
