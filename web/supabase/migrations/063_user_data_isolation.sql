-- ============================================================================
-- USER DATA ISOLATION
-- Ensures each user can only see their own data
-- ============================================================================

-- 1. Add user_id columns where missing (safe with IF NOT EXISTS)

-- Reference Videos (Winners Bank)
ALTER TABLE reference_videos ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_reference_videos_user ON reference_videos(user_id);

-- Audience Personas (allow user customization)
ALTER TABLE audience_personas ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE audience_personas ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_audience_personas_user ON audience_personas(user_id);

-- Pain Points
ALTER TABLE pain_points ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_pain_points_user ON pain_points(user_id);

-- 2. Update existing system personas to be shared
UPDATE audience_personas SET is_system = true WHERE user_id IS NULL;

-- 3. Drop existing policies and create user-specific ones

-- REFERENCE VIDEOS (Winners Bank)
DROP POLICY IF EXISTS "Winners are viewable by authenticated users" ON reference_videos;
DROP POLICY IF EXISTS "Admins can manage winners" ON reference_videos;
DROP POLICY IF EXISTS "reference_videos_select" ON reference_videos;
DROP POLICY IF EXISTS "reference_videos_insert" ON reference_videos;
DROP POLICY IF EXISTS "reference_videos_update" ON reference_videos;
DROP POLICY IF EXISTS "reference_videos_delete" ON reference_videos;
DROP POLICY IF EXISTS "Users can view own winners" ON reference_videos;
DROP POLICY IF EXISTS "Users can insert own winners" ON reference_videos;
DROP POLICY IF EXISTS "Users can update own winners" ON reference_videos;
DROP POLICY IF EXISTS "Users can delete own winners" ON reference_videos;

ALTER TABLE reference_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own winners" ON reference_videos
  FOR SELECT USING (
    auth.uid() = user_id
    OR user_id IS NULL  -- Legacy data visible to all
  );

CREATE POLICY "Users can insert own winners" ON reference_videos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own winners" ON reference_videos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own winners" ON reference_videos
  FOR DELETE USING (auth.uid() = user_id);

-- AUDIENCE PERSONAS
DROP POLICY IF EXISTS "Personas viewable by authenticated" ON audience_personas;
DROP POLICY IF EXISTS "Admins can manage personas" ON audience_personas;
DROP POLICY IF EXISTS "audience_personas_select" ON audience_personas;
DROP POLICY IF EXISTS "audience_personas_insert" ON audience_personas;
DROP POLICY IF EXISTS "audience_personas_update" ON audience_personas;
DROP POLICY IF EXISTS "audience_personas_delete" ON audience_personas;
DROP POLICY IF EXISTS "Users can view personas" ON audience_personas;
DROP POLICY IF EXISTS "Users can insert own personas" ON audience_personas;
DROP POLICY IF EXISTS "Users can update own personas" ON audience_personas;
DROP POLICY IF EXISTS "Users can delete own personas" ON audience_personas;

ALTER TABLE audience_personas ENABLE ROW LEVEL SECURITY;

-- Users can see system personas and their own
CREATE POLICY "Users can view personas" ON audience_personas
  FOR SELECT USING (
    is_system = true
    OR auth.uid() = user_id
  );

CREATE POLICY "Users can insert own personas" ON audience_personas
  FOR INSERT WITH CHECK (auth.uid() = user_id AND (is_system = false OR is_system IS NULL));

CREATE POLICY "Users can update own personas" ON audience_personas
  FOR UPDATE USING (auth.uid() = user_id AND (is_system = false OR is_system IS NULL));

CREATE POLICY "Users can delete own personas" ON audience_personas
  FOR DELETE USING (auth.uid() = user_id AND (is_system = false OR is_system IS NULL));

-- PAIN POINTS
DROP POLICY IF EXISTS "pain_points_select" ON pain_points;
DROP POLICY IF EXISTS "pain_points_insert" ON pain_points;
DROP POLICY IF EXISTS "Users can view pain points" ON pain_points;
DROP POLICY IF EXISTS "Users can manage own pain points" ON pain_points;

ALTER TABLE pain_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pain points" ON pain_points
  FOR SELECT USING (
    user_id IS NULL
    OR auth.uid() = user_id
    OR created_by IS NULL
  );

CREATE POLICY "Users can manage own pain points" ON pain_points
  FOR ALL USING (auth.uid() = user_id OR auth.uid() = created_by);

-- SAVED SKITS (ensure isolation - table definitely exists)
DROP POLICY IF EXISTS "Users can view own skits" ON saved_skits;
DROP POLICY IF EXISTS "Users can insert own skits" ON saved_skits;
DROP POLICY IF EXISTS "Users can update own skits" ON saved_skits;
DROP POLICY IF EXISTS "Users can delete own skits" ON saved_skits;
DROP POLICY IF EXISTS "Users can manage own skits" ON saved_skits;

ALTER TABLE saved_skits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own skits" ON saved_skits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own skits" ON saved_skits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own skits" ON saved_skits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own skits" ON saved_skits
  FOR DELETE USING (auth.uid() = user_id);

-- GENERATED IMAGES (B-Roll) - table definitely exists
DROP POLICY IF EXISTS "Users can view own images" ON generated_images;
DROP POLICY IF EXISTS "Users can manage own images" ON generated_images;

ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own images" ON generated_images
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own images" ON generated_images
  FOR ALL USING (auth.uid() = user_id);

-- Comments
COMMENT ON COLUMN reference_videos.user_id IS 'Owner of this winner analysis';
COMMENT ON COLUMN audience_personas.is_system IS 'True for shared system personas, false for user-created';
