-- Script Version History
-- Tracks versions of saved skits for history and restore

-- Add version tracking fields to saved_skits if not exists
ALTER TABLE saved_skits
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES saved_skits(id) ON DELETE SET NULL;

-- Create index for version chain queries
CREATE INDEX IF NOT EXISTS idx_saved_skits_parent_version ON saved_skits(parent_version_id);

-- Create a table to store version snapshots (for efficient storage)
CREATE TABLE IF NOT EXISTS skit_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skit_id UUID NOT NULL REFERENCES saved_skits(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  skit_data JSONB NOT NULL,
  title TEXT NOT NULL,
  change_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  UNIQUE(skit_id, version)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_skit_versions_skit_id ON skit_versions(skit_id);
CREATE INDEX IF NOT EXISTS idx_skit_versions_created_at ON skit_versions(created_at DESC);

-- RLS Policies
ALTER TABLE skit_versions ENABLE ROW LEVEL SECURITY;

-- Users can view versions of their own skits
CREATE POLICY "Users can view own skit versions" ON skit_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM saved_skits
      WHERE saved_skits.id = skit_versions.skit_id
      AND saved_skits.user_id = auth.uid()
    )
  );

-- Users can insert versions for their own skits
CREATE POLICY "Users can create versions for own skits" ON skit_versions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM saved_skits
      WHERE saved_skits.id = skit_versions.skit_id
      AND saved_skits.user_id = auth.uid()
    )
  );

-- Function to create a version snapshot before update
CREATE OR REPLACE FUNCTION create_skit_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create version if skit_data changed
  IF OLD.skit_data IS DISTINCT FROM NEW.skit_data THEN
    INSERT INTO skit_versions (skit_id, version, skit_data, title, created_by)
    VALUES (OLD.id, OLD.version, OLD.skit_data, OLD.title, auth.uid());

    -- Increment version number
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create versions on update
DROP TRIGGER IF EXISTS trigger_create_skit_version ON saved_skits;
CREATE TRIGGER trigger_create_skit_version
  BEFORE UPDATE ON saved_skits
  FOR EACH ROW
  EXECUTE FUNCTION create_skit_version();

COMMENT ON TABLE skit_versions IS 'Stores historical versions of saved skits for version history and restore';
