-- Background job queue table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('detect_winners', 'analyze_transcript', 'generate_script', 'refresh_metrics', 'replicate_pattern')),
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_status_created ON jobs(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_jobs_workspace ON jobs(workspace_id);
CREATE INDEX idx_jobs_type_status ON jobs(type, status);

-- RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
  ON jobs FOR SELECT
  USING (workspace_id = auth.uid());

CREATE POLICY "Service role full access on jobs"
  ON jobs FOR ALL
  USING (true)
  WITH CHECK (true);
