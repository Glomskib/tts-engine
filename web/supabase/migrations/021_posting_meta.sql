-- 021_posting_meta.sql
-- Add posting_meta JSONB field for uploader readiness gate
-- This stores target posting configuration that isn't part of the locked script

-- Add posting_meta JSONB column to videos
-- Contains: target_account, uploader_checklist_completed_at, and any posting overrides
alter table public.videos
  add column if not exists posting_meta jsonb null default null;

-- Index for querying videos by target account
create index if not exists idx_videos_posting_meta_target_account
  on public.videos using btree (((posting_meta->>'target_account')))
  where posting_meta is not null;

-- Comment for documentation
comment on column public.videos.posting_meta is 'Posting metadata: target_account, uploader_checklist_completed_at, etc. Required for ready_to_post transition.';
