-- Phase 1 hardening: queued status + timing columns for the AI Video Editor.
-- `queued` = enqueued into Inngest, not yet picked up by a worker.
-- `started_at` / `finished_at` drive the 30-minute timeout sweeper cron.

alter table edit_jobs
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz;

create index if not exists idx_edit_jobs_started_at
  on edit_jobs (started_at)
  where started_at is not null;

-- Expand the status check constraint to allow 'queued'.
alter table edit_jobs drop constraint if exists edit_jobs_status_check;
alter table edit_jobs add constraint edit_jobs_status_check
  check (status in (
    'draft',
    'uploading',
    'queued',
    'transcribing',
    'building_timeline',
    'rendering',
    'completed',
    'failed'
  ));
