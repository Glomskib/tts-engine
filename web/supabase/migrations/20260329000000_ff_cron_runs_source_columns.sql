-- Add run-source attribution columns to ff_cron_runs
-- Enables answering "Did OpenClaw cause this?" and source-grouped health views.

ALTER TABLE ff_cron_runs
  ADD COLUMN IF NOT EXISTS run_source  text,
  ADD COLUMN IF NOT EXISTS requested_by text;

-- Valid sources: vercel_cron, launchd, manual, openclaw, dispatch
-- No CHECK constraint — new sources can be added without migration.

-- Index for source-filtered queries (health dashboard, dispatch dedup)
CREATE INDEX IF NOT EXISTS idx_ff_cron_runs_job_source
  ON ff_cron_runs (job, run_source, started_at DESC);

COMMENT ON COLUMN ff_cron_runs.run_source IS 'What triggered this run: vercel_cron | launchd | manual | openclaw | dispatch';
COMMENT ON COLUMN ff_cron_runs.requested_by IS 'Who/what requested this run (e.g. admin email, openclaw agent ID, cron schedule name)';
