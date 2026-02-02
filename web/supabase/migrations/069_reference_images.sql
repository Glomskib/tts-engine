-- ============================================================================
-- REFERENCE IMAGES FOR B-ROLL GENERATION
-- Upload and use reference images to guide AI image generation
-- ============================================================================

-- Reference images table
CREATE TABLE IF NOT EXISTS reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_size INTEGER,
  mime_type VARCHAR(100),
  width INTEGER,
  height INTEGER,
  tags TEXT[] DEFAULT '{}',
  folder VARCHAR(255),
  usage_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reference_images_user ON reference_images(user_id);
CREATE INDEX IF NOT EXISTS idx_reference_images_user_folder ON reference_images(user_id, folder);
CREATE INDEX IF NOT EXISTS idx_reference_images_created ON reference_images(user_id, created_at DESC);

-- RLS
ALTER TABLE reference_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reference images" ON reference_images;
DROP POLICY IF EXISTS "Users can insert own reference images" ON reference_images;
DROP POLICY IF EXISTS "Users can update own reference images" ON reference_images;
DROP POLICY IF EXISTS "Users can delete own reference images" ON reference_images;

CREATE POLICY "Users can view own reference images" ON reference_images
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reference images" ON reference_images
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reference images" ON reference_images
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reference images" ON reference_images
  FOR DELETE USING (auth.uid() = user_id);

-- Storage limits per plan (enforced in application code):
-- Free: 5 reference images
-- Starter: 20 reference images
-- Pro: 100 reference images
-- Unlimited: 500 reference images

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
