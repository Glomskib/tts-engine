-- Migration: saved_pain_points
-- Created: 2026-02-15
-- Purpose: Allow users to save and reuse pain points globally

CREATE TABLE IF NOT EXISTS saved_pain_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pain_point_text TEXT NOT NULL,
  category TEXT,
  times_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_pain_points_user_id ON saved_pain_points(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_pain_points_times_used ON saved_pain_points(times_used DESC);

-- RLS policies
ALTER TABLE saved_pain_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own saved pain points" ON saved_pain_points;
CREATE POLICY "Users can view their own saved pain points"
  ON saved_pain_points FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own saved pain points" ON saved_pain_points;
CREATE POLICY "Users can insert their own saved pain points"
  ON saved_pain_points FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own saved pain points" ON saved_pain_points;
CREATE POLICY "Users can update their own saved pain points"
  ON saved_pain_points FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own saved pain points" ON saved_pain_points;
CREATE POLICY "Users can delete their own saved pain points"
  ON saved_pain_points FOR DELETE
  USING (auth.uid() = user_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_saved_pain_points_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_saved_pain_points_updated_at ON saved_pain_points;
CREATE TRIGGER update_saved_pain_points_updated_at
  BEFORE UPDATE ON saved_pain_points
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_pain_points_updated_at();
