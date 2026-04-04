-- Content Experiments: tag content items with experiment variables to compare performance
CREATE TABLE IF NOT EXISTS content_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  variable_type TEXT NOT NULL CHECK (variable_type IN ('hook', 'format', 'product', 'length')),
  variant TEXT NOT NULL,
  content_item_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK to content_items deferred: table created in 20260330000000_content_items_system.sql
-- Added via 20260330000002_content_experiments_fk.sql after the target table exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'content_items') THEN
    ALTER TABLE content_experiments
      ADD CONSTRAINT fk_ce_content_item FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE;
  END IF;
END $$;

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
