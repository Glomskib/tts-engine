-- Content Memory: aggregated learning across all posts
CREATE TABLE IF NOT EXISTS content_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('hook', 'format', 'product', 'pattern')),
  value TEXT NOT NULL,
  performance_score NUMERIC NOT NULL DEFAULT 0,
  occurrences INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint to prevent duplicate entries per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_memory_unique
  ON content_memory (workspace_id, memory_type, value);

CREATE INDEX IF NOT EXISTS idx_content_memory_workspace_score
  ON content_memory (workspace_id, performance_score DESC);

-- RLS
ALTER TABLE content_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own content_memory"
  ON content_memory FOR SELECT
  USING (auth.uid() = workspace_id);

CREATE POLICY "Service role full access on content_memory"
  ON content_memory FOR ALL
  USING (auth.role() = 'service_role');
