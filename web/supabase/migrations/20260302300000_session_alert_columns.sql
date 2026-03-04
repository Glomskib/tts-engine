-- Session Alerts: Add cooldown tracking columns to ff_session_status
-- Non-destructive — existing rows get NULL (treated as "never alerted").

ALTER TABLE public.ff_session_status
  ADD COLUMN IF NOT EXISTS last_expiring_alert_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_invalid_alert_at TIMESTAMPTZ;

-- Force PostgREST to pick up the new columns immediately.
NOTIFY pgrst, 'reload schema';
