-- Saved Skits Table
-- Stores saved skits for library/reuse functionality

CREATE TABLE IF NOT EXISTS saved_skits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Title for display in library
  title TEXT NOT NULL,

  -- The skit data (stored as JSONB)
  skit_data JSONB NOT NULL,

  -- Generation config that produced this skit
  generation_config JSONB,

  -- Product info
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  product_brand TEXT,

  -- Workflow status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'produced', 'posted', 'archived')),

  -- User/org ownership
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID,

  -- Ratings/scores
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  ai_score JSONB,  -- For future AI scoring: {hook: 8, humor: 7, virality: 6, overall: 7}

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_saved_skits_user_id ON saved_skits(user_id);
CREATE INDEX idx_saved_skits_status ON saved_skits(status);
CREATE INDEX idx_saved_skits_created_at ON saved_skits(created_at DESC);
CREATE INDEX idx_saved_skits_product_id ON saved_skits(product_id);
CREATE INDEX idx_saved_skits_user_status ON saved_skits(user_id, status);

-- Simple btree index on title for prefix searches
CREATE INDEX idx_saved_skits_title ON saved_skits(title);

-- RLS Policies
ALTER TABLE saved_skits ENABLE ROW LEVEL SECURITY;

-- Users can view their own skits
CREATE POLICY "Users can view own skits"
  ON saved_skits FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own skits
CREATE POLICY "Users can insert own skits"
  ON saved_skits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own skits
CREATE POLICY "Users can update own skits"
  ON saved_skits FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own skits
CREATE POLICY "Users can delete own skits"
  ON saved_skits FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_saved_skits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_saved_skits_updated_at
  BEFORE UPDATE ON saved_skits
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_skits_updated_at();

-- Comment
COMMENT ON TABLE saved_skits IS 'Stores saved skits for library/reuse with workflow status tracking';
