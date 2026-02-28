-- Revenue Intelligence – Run State Tracker
-- Tracks when the last ingestion ran per user for new-comment counting.

CREATE TABLE IF NOT EXISTS public.ri_run_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ri_run_state ENABLE ROW LEVEL SECURITY;

-- Service role only (not user-facing)
CREATE POLICY "Service role full access ri_run_state"
  ON ri_run_state FOR ALL
  USING (auth.role() = 'service_role');
