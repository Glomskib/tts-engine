-- Enhance saved_hooks table with times_used and source_script_id
ALTER TABLE saved_hooks
  ADD COLUMN IF NOT EXISTS times_used INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_script_id UUID REFERENCES saved_skits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_script_title TEXT;

-- Create index for source_script lookups
CREATE INDEX IF NOT EXISTS idx_saved_hooks_source_script ON saved_hooks(source_script_id);

-- Function to increment times_used when a hook is used
CREATE OR REPLACE FUNCTION increment_hook_usage(hook_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE saved_hooks
  SET times_used = times_used + 1
  WHERE id = hook_id;
END;
$$;
