-- Adds the `edits` counter column to daily_usage so checkDailyLimit('edits')
-- can actually enforce free-tier caps. Without this, the helper fails open
-- and free users are effectively unlimited on edits.

alter table public.daily_usage
  add column if not exists edits integer not null default 0;
