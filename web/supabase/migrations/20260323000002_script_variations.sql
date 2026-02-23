-- Add parent_id to scripts for variation tracking
ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS parent_id uuid
  REFERENCES public.scripts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scripts_parent_id
  ON public.scripts(parent_id) WHERE parent_id IS NOT NULL;
