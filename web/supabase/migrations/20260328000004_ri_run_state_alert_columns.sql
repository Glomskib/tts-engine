-- Revenue Intelligence: Add alert tracking columns to ri_run_state
-- Non-destructive — existing rows get NULL (treated as "never sent").

ALTER TABLE public.ri_run_state
  ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_alert_summary JSONB;

-- Force PostgREST to pick up the new columns immediately.
NOTIFY pgrst, 'reload schema';
