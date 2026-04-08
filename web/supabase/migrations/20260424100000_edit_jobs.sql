-- AI Video Editor — edit_jobs table
-- Tracks user-initiated video edit jobs through the processing state machine.

create table if not exists edit_jobs (
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

create index if not exists idx_edit_jobs_user_created
  on edit_jobs (user_id, created_at desc);

create index if not exists idx_edit_jobs_status
  on edit_jobs (status);

-- Allowed status values (soft check — application enforces transitions)
alter table edit_jobs drop constraint if exists edit_jobs_status_check;
alter table edit_jobs add constraint edit_jobs_status_check
  check (status in ('draft','uploading','transcribing','building_timeline','rendering','completed','failed'));

alter table edit_jobs drop constraint if exists edit_jobs_mode_check;
alter table edit_jobs add constraint edit_jobs_mode_check
  check (mode in ('quick','hook','ugc','talking_head'));

-- updated_at trigger
create or replace function edit_jobs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_edit_jobs_touch on edit_jobs;
create trigger trg_edit_jobs_touch
  before update on edit_jobs
  for each row execute function edit_jobs_touch_updated_at();

-- RLS — user-self
alter table edit_jobs enable row level security;

drop policy if exists "Users manage own edit jobs" on edit_jobs;
create policy "Users manage own edit jobs"
  on edit_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
