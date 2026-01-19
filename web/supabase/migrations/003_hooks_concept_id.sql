-- Add concept_id column to hooks table with foreign key relationship
-- Run this in Supabase Dashboard > SQL Editor

-- Add concept_id column to hooks table
ALTER TABLE public.hooks ADD COLUMN IF NOT EXISTS concept_id uuid;

-- Add foreign key constraint to link hooks to concepts
ALTER TABLE public.hooks ADD CONSTRAINT hooks_concept_id_fkey 
  FOREIGN KEY (concept_id) REFERENCES public.concepts(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS hooks_concept_id_idx ON public.hooks (concept_id);

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'hooks'
ORDER BY ordinal_position;

-- Check foreign key constraints
SELECT 
  tc.constraint_name, 
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM 
  information_schema.table_constraints AS tc 
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'hooks';
