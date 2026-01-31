-- Favorites and Collections System
-- Allows users to organize and favorite their scripts

-- Add favorites field to saved_skits if not exists
ALTER TABLE saved_skits
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_saved_skits_is_favorite ON saved_skits(user_id, is_favorite) WHERE is_favorite = TRUE;

-- Collections table
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#8B5CF6', -- violet default
  icon TEXT DEFAULT 'folder',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_shared BOOLEAN DEFAULT FALSE,
  share_with_team BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT collections_name_length CHECK (char_length(name) <= 100)
);

-- Collection items junction table
CREATE TABLE IF NOT EXISTS collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  skit_id UUID NOT NULL REFERENCES saved_skits(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  position INTEGER DEFAULT 0,

  UNIQUE(collection_id, skit_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_skit_id ON collection_items(skit_id);

-- RLS Policies for collections
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own collections" ON collections
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own collections" ON collections
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own collections" ON collections
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own collections" ON collections
  FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for collection items
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items in own collections" ON collection_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_items.collection_id
      AND collections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add to own collections" ON collection_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_items.collection_id
      AND collections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove from own collections" ON collection_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_items.collection_id
      AND collections.user_id = auth.uid()
    )
  );

-- Function to get collection item count
CREATE OR REPLACE FUNCTION get_collection_item_count(collection_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM collection_items WHERE collection_id = collection_uuid;
$$ LANGUAGE SQL STABLE;

-- Trigger to update collections.updated_at when items change
CREATE OR REPLACE FUNCTION update_collection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE collections SET updated_at = NOW()
  WHERE id = COALESCE(NEW.collection_id, OLD.collection_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_collection_timestamp ON collection_items;
CREATE TRIGGER trigger_update_collection_timestamp
  AFTER INSERT OR DELETE ON collection_items
  FOR EACH ROW
  EXECUTE FUNCTION update_collection_timestamp();

COMMENT ON TABLE collections IS 'User-created collections for organizing saved skits';
COMMENT ON TABLE collection_items IS 'Junction table linking skits to collections';
