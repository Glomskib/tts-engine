-- Add missing columns to concepts table
-- Run this in Supabase SQL Editor

ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS notes text;

-- Update any existing rows to have non-empty title
UPDATE public.concepts SET title = 'Untitled Concept' WHERE title = '' OR title IS NULL;

-- Verify the table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'concepts'
ORDER BY ordinal_position;
