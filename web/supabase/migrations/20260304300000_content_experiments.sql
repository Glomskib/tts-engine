-- Content Experiments: tag content items with experiment variables to compare performance
CREATE TABLE IF NOT EXISTS content_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  variable_type TEXT NOT NULL CHECK (variable_type IN ('hook', 'format', 'product', 'length')),
  variant TEXT NOT NULL,
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiments_workspace_type
  ON content_experiments (workspace_id, variable_type);

CREATE INDEX IF NOT EXISTS idx_experiments_content_item
  ON content_experiments (content_item_id);

-- RLS
ALTER TABLE content_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own experiments"
  ON content_experiments FOR SELECT
  USING (auth.uid() = workspace_id);

CREATE POLICY "Users can insert own experiments"
  ON content_experiments FOR INSERT
  WITH CHECK (auth.uid() = workspace_id);

CREATE POLICY "Users can delete own experiments"
  ON content_experiments FOR DELETE
  USING (auth.uid() = workspace_id);

CREATE POLICY "Service role full access on experiments"
  ON content_experiments FOR ALL
  USING (auth.role() = 'service_role');
