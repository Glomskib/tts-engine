-- Saved hooks collection for storing winning/favorite hooks
CREATE TABLE IF NOT EXISTS saved_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  hook_text TEXT NOT NULL,
  source TEXT DEFAULT 'generated',
  content_type TEXT,
  content_format TEXT,
  product_id UUID,
  product_name TEXT,
  brand_name TEXT,
  performance_score INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE saved_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own hooks" ON saved_hooks
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_saved_hooks_user ON saved_hooks(user_id);
CREATE INDEX idx_saved_hooks_score ON saved_hooks(performance_score DESC);
