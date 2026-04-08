-- AI Video Editor — ai_edit_jobs table
-- Tracks user-initiated video edit jobs through the processing state machine.
-- NOTE: Renamed from `edit_jobs` to avoid collision with the pre-existing
-- editing-marketplace `edit_jobs` table used by the VA workflow.

create table if not exists ai_edit_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Edit',
  mode text not null default 'quick',
  status text not null default 'draft',
  error text,
  script_id uuid,
  transcript jsonb,
  assets jsonb not null default '[]'::jsonb,
  output_url text,
  preview_url text,
  mode_options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_edit_jobs_user_created
  on ai_edit_jobs (user_id, created_at desc);

create index if not exists idx_ai_edit_jobs_status
  on ai_edit_jobs (status);

alter table ai_edit_jobs drop constraint if exists ai_edit_jobs_status_check;
alter table ai_edit_jobs add constraint ai_edit_jobs_status_check
  check (status in ('draft','uploading','transcribing','building_timeline','rendering','completed','failed'));

alter table ai_edit_jobs drop constraint if exists ai_edit_jobs_mode_check;
alter table ai_edit_jobs add constraint ai_edit_jobs_mode_check
  check (mode in ('quick','hook','ugc','talking_head'));

create or replace function ai_edit_jobs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ai_edit_jobs_touch on ai_edit_jobs;
create trigger trg_ai_edit_jobs_touch
  before update on ai_edit_jobs
  for each row execute function ai_edit_jobs_touch_updated_at();

alter table ai_edit_jobs enable row level security;

drop policy if exists "Users manage own ai edit jobs" on ai_edit_jobs;
create policy "Users manage own ai edit jobs"
  on ai_edit_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
