-- ============================================================================
-- B-ROLL IMAGE LIBRARY
-- Save and organize generated B-Roll images
-- ============================================================================

-- B-Roll image library for saved images
CREATE TABLE IF NOT EXISTS b_roll_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  prompt TEXT,
  style VARCHAR(100),
  aspect_ratio VARCHAR(20),
  model VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  is_favorite BOOLEAN DEFAULT FALSE,
  folder VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_b_roll_library_user ON b_roll_library(user_id);
CREATE INDEX IF NOT EXISTS idx_b_roll_library_user_folder ON b_roll_library(user_id, folder);
CREATE INDEX IF NOT EXISTS idx_b_roll_library_favorite ON b_roll_library(user_id, is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX IF NOT EXISTS idx_b_roll_library_created ON b_roll_library(user_id, created_at DESC);

-- RLS
ALTER TABLE b_roll_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own b-roll" ON b_roll_library;
DROP POLICY IF EXISTS "Users can insert own b-roll" ON b_roll_library;
DROP POLICY IF EXISTS "Users can update own b-roll" ON b_roll_library;
DROP POLICY IF EXISTS "Users can delete own b-roll" ON b_roll_library;

CREATE POLICY "Users can view own b-roll" ON b_roll_library
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own b-roll" ON b_roll_library
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own b-roll" ON b_roll_library
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own b-roll" ON b_roll_library
  FOR DELETE USING (auth.uid() = user_id);

-- Storage limits per plan (enforced in application code):
-- Free: 10 images
-- Starter: 50 images
-- Pro: 200 images
-- Unlimited: 1000 images

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
