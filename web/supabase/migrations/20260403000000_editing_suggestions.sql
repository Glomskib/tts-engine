-- Editing suggestions table
-- Stores AI-generated edit suggestions for video content

CREATE TABLE IF NOT EXISTS editing_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  timestamp_start NUMERIC, -- seconds
  timestamp_end NUMERIC,   -- seconds
  suggestion TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cut_pause', 'remove_mistake', 'add_broll', 'add_text_overlay', 'highlight_hook')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_editing_suggestions_content_item ON editing_suggestions(content_item_id);
CREATE INDEX idx_editing_suggestions_workspace ON editing_suggestions(workspace_id);

-- RLS
ALTER TABLE editing_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own editing suggestions"
  ON editing_suggestions FOR SELECT
  USING (workspace_id = auth.uid());

CREATE POLICY "Service role full access on editing_suggestions"
  ON editing_suggestions FOR ALL
  USING (true)
  WITH CHECK (true);
