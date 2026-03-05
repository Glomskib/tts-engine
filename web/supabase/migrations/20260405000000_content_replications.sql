-- Content replications tracking table
CREATE TABLE IF NOT EXISTS content_replications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  pattern_id UUID NOT NULL REFERENCES winner_patterns_v2(id) ON DELETE CASCADE,
  source_content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  replication_count INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_replications_workspace ON content_replications(workspace_id);
CREATE INDEX idx_content_replications_pattern ON content_replications(pattern_id);

-- RLS
ALTER TABLE content_replications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own replications"
  ON content_replications FOR SELECT
  USING (workspace_id = auth.uid());

CREATE POLICY "Service role full access on content_replications"
  ON content_replications FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add pattern_id column to content_items for tracking lineage
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS pattern_id UUID REFERENCES winner_patterns_v2(id) ON DELETE SET NULL;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS generated_from_pattern BOOLEAN DEFAULT false;
