-- Phase 2: variations engine.
-- Adds parent_job_id so variation jobs link back to the source job,
-- and adds 'variations' as a tracked daily_usage column.

alter table ai_edit_jobs
  add column if not exists parent_job_id uuid references ai_edit_jobs(id) on delete set null;

create index if not exists idx_ai_edit_jobs_parent
  on ai_edit_jobs (parent_job_id)
  where parent_job_id is not null;

alter table daily_usage
  add column if not exists variations integer not null default 0;
