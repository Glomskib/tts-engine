-- Phase 1 hardening: queued status + timing columns for the AI Video Editor.
-- `queued` = enqueued into Inngest, not yet picked up by a worker.
-- `started_at` / `finished_at` drive the 30-minute timeout sweeper cron.

alter table ai_edit_jobs
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz;

create index if not exists idx_ai_edit_jobs_started_at
  on ai_edit_jobs (started_at)
  where started_at is not null;

alter table ai_edit_jobs drop constraint if exists ai_edit_jobs_status_check;
alter table ai_edit_jobs add constraint ai_edit_jobs_status_check
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
