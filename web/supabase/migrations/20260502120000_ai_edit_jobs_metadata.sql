-- AI Video Editor — ai_edit_jobs.metadata column.
--
-- The script-attempts override endpoint and a few internal pipeline
-- breadcrumbs write into `metadata` (jsonb), but no migration ever added
-- the column. Result: every override silently no-op'd on the DB side
-- (Supabase JS v2 surfaces such errors via .error, not by throwing).
--
-- Strictly additive. Safe to run repeatedly.

ALTER TABLE ai_edit_jobs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- GIN index so future "where metadata->>'needs_rerender'='true'" queries
-- (used by a planned rerender sweeper) stay fast.
CREATE INDEX IF NOT EXISTS idx_ai_edit_jobs_metadata_gin
  ON ai_edit_jobs USING gin (metadata);
