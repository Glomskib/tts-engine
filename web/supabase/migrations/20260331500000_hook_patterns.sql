-- Hook Patterns — extracted from successful postmortems
-- When a postmortem detects hook_strength >= 7, the hook pattern is stored
-- and reused in future brief generation.

CREATE TABLE IF NOT EXISTS public.hook_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  pattern TEXT NOT NULL,
  example_hook TEXT,
  performance_score NUMERIC(5, 2) DEFAULT 0,
  uses_count INT NOT NULL DEFAULT 0,
  source_post_id UUID REFERENCES public.content_item_posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hp_workspace_score
  ON hook_patterns(workspace_id, performance_score DESC);

-- RLS
ALTER TABLE hook_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY hp_select ON hook_patterns FOR SELECT USING (
  auth.uid() = workspace_id
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY hp_insert ON hook_patterns FOR INSERT WITH CHECK (auth.uid() = workspace_id);
CREATE POLICY hp_update ON hook_patterns FOR UPDATE USING (auth.uid() = workspace_id);
CREATE POLICY hp_delete ON hook_patterns FOR DELETE USING (auth.uid() = workspace_id);
CREATE POLICY hp_service ON hook_patterns FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
