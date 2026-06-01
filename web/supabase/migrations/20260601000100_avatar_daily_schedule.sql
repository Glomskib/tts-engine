-- ════════════════════════════════════════════════════════════════════
-- Avatar daily schedule
--
-- Adds the columns the avatar-daily-tick cron and the per-avatar
-- /avatars/[id]/schedule page need:
--
--   brand_profiles
--     daily_post_enabled       — toggle for the auto-pilot
--     daily_post_timezone      — user-local timezone (display only;
--                                cron is currently a fixed 13:00 UTC)
--     daily_post_target_time   — preferred local post time
--
--   avatar_scripts
--     used_at                  — when the daily cron consumed this script
--     used_for_content_item_id — link back to the spawned content_items row
--
-- Idempotent. No destructive ops.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS daily_post_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS daily_post_timezone TEXT DEFAULT 'America/New_York';

ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS daily_post_target_time TIME DEFAULT '08:00:00';

-- Small helper index so the cron's avatar fan-out scan stays cheap.
CREATE INDEX IF NOT EXISTS brand_profiles_daily_post_enabled_idx
  ON public.brand_profiles(daily_post_enabled)
  WHERE is_avatar = true AND daily_post_enabled = true;

ALTER TABLE public.avatar_scripts
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

ALTER TABLE public.avatar_scripts
  ADD COLUMN IF NOT EXISTS used_for_content_item_id UUID;

-- Index for "next unused script" lookups inside the cron.
CREATE INDEX IF NOT EXISTS avatar_scripts_unused_brand_idx
  ON public.avatar_scripts(brand_profile_id, created_at)
  WHERE used_at IS NULL;

COMMENT ON COLUMN public.brand_profiles.daily_post_enabled IS
  'When true, /api/cron/avatar-daily-tick will render one content_item per day for this avatar.';
COMMENT ON COLUMN public.brand_profiles.daily_post_timezone IS
  'IANA timezone (e.g. America/New_York). Display + future scheduler logic.';
COMMENT ON COLUMN public.brand_profiles.daily_post_target_time IS
  'Preferred local time of day to publish. Display + future scheduler logic.';
COMMENT ON COLUMN public.avatar_scripts.used_at IS
  'Stamped by the daily cron when this script was handed to publish-ready.';
COMMENT ON COLUMN public.avatar_scripts.used_for_content_item_id IS
  'The content_items row spawned from this script (nullable — best-effort).';
