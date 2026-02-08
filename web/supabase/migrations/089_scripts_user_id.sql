-- Migration 089: Add user_id column to scripts table
-- The scripts API routes filter/insert by user_id but the column was never created.

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Index for user_id lookups (used by GET /api/scripts)
CREATE INDEX IF NOT EXISTS idx_scripts_user_id ON public.scripts(user_id);

-- Backfill: set user_id from created_by where possible
-- created_by stores a text identifier; if it's a valid UUID, use it
UPDATE public.scripts
SET user_id = created_by::uuid
WHERE user_id IS NULL
  AND created_by IS NOT NULL
  AND created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
