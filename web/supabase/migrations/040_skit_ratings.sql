-- Skit Ratings Table
-- Stores user ratings and feedback for generated skits

CREATE TABLE IF NOT EXISTS skit_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The skit data that was rated (stored as JSONB)
  skit_data JSONB NOT NULL,

  -- Rating (1-5 stars)
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),

  -- Optional feedback text
  feedback TEXT,

  -- User who submitted the rating
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Organization context (if applicable)
  org_id UUID,

  -- Generation metadata for analysis
  generation_config JSONB,  -- Stores: risk_tier, persona, chaos_level, intensity, etc.
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  product_brand TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_skit_ratings_user_id ON skit_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_skit_ratings_rating ON skit_ratings(rating);
CREATE INDEX IF NOT EXISTS idx_skit_ratings_created_at ON skit_ratings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skit_ratings_product_id ON skit_ratings(product_id);

-- RLS Policies
ALTER TABLE skit_ratings ENABLE ROW LEVEL SECURITY;

-- Users can view their own ratings
DROP POLICY IF EXISTS "Users can view own ratings" ON skit_ratings;
CREATE POLICY "Users can view own ratings"
  ON skit_ratings FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own ratings
DROP POLICY IF EXISTS "Users can insert own ratings" ON skit_ratings;
CREATE POLICY "Users can insert own ratings"
  ON skit_ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own ratings
DROP POLICY IF EXISTS "Users can update own ratings" ON skit_ratings;
CREATE POLICY "Users can update own ratings"
  ON skit_ratings FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own ratings
DROP POLICY IF EXISTS "Users can delete own ratings" ON skit_ratings;
CREATE POLICY "Users can delete own ratings"
  ON skit_ratings FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_skit_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_skit_ratings_updated_at ON skit_ratings;
CREATE TRIGGER trigger_skit_ratings_updated_at
  BEFORE UPDATE ON skit_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_skit_ratings_updated_at();

-- Comment
COMMENT ON TABLE skit_ratings IS 'Stores user ratings and feedback for AI-generated skits';
