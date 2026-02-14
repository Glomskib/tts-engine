-- Add scheduled_time column so auto-post cron can delay posting until a specific time of day
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS scheduled_time TIME;
