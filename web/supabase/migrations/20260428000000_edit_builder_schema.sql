-- 20260428000000_edit_builder_schema.sql
--
-- Edit Builder — new product surface for user-controllable video editing.
-- Strictly ADDITIVE. Does NOT touch the legacy `ai_edit_jobs` table or its
-- Inngest-based pipeline. The two paths run in parallel until Phase 3+.
--
-- Tables:
--   edit_projects       — top-level editing project (one per "edit session")
--   edit_source_clips   — uploaded raw clips belonging to a project
--   edit_analysis       — transcript + detected-moment analysis per clip
--   edit_plans          — structured EditPlan JSON, versioned per project
--   render_jobs         — DB-polled queue consumed by the Mac mini worker
--   worker_nodes        — registry of worker machines (admin-only)
--
-- Ownership model: user_id columns mirror the existing `ai_edit_jobs` pattern.
-- There is no separate tenants table in this codebase; "tenant" == auth user.
-- The prompt's `tenant_id` field is modeled as `user_id` for consistency with
-- the rest of the schema. All RLS is `auth.uid() = user_id`.
--
-- Worker queue claim: see the `claim_render_job(worker_id)` function at the
-- bottom. It uses FOR UPDATE SKIP LOCKED for safe single-job atomic claim.

-- =========================================================================
-- edit_projects
-- =========================================================================
create table if not exists public.edit_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Project',
  status text not null default 'draft',
  aspect_ratio text not null default '9:16',
  target_platform text not null default 'tiktok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.edit_projects drop constraint if exists edit_projects_status_check;
alter table public.edit_projects add constraint edit_projects_status_check
  check (status in ('draft','analyzing','plan_ready','rendering','completed','failed'));

alter table public.edit_projects drop constraint if exists edit_projects_aspect_check;
alter table public.edit_projects add constraint edit_projects_aspect_check
  check (aspect_ratio in ('9:16','1:1','16:9'));

create index if not exists idx_edit_projects_user_created
  on public.edit_projects (user_id, created_at desc);

-- =========================================================================
-- edit_source_clips
-- =========================================================================
create table if not exists public.edit_source_clips (
  id uuid primary key default gen_random_uuid(),
  edit_project_id uuid not null references public.edit_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  duration_ms integer,
  transcript_status text not null default 'pending',
  analysis_status text not null default 'pending',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.edit_source_clips drop constraint if exists edit_source_clips_transcript_check;
alter table public.edit_source_clips add constraint edit_source_clips_transcript_check
  check (transcript_status in ('pending','in_progress','done','failed'));

alter table public.edit_source_clips drop constraint if exists edit_source_clips_analysis_check;
alter table public.edit_source_clips add constraint edit_source_clips_analysis_check
  check (analysis_status in ('pending','in_progress','done','failed'));

create index if not exists idx_edit_source_clips_project
  on public.edit_source_clips (edit_project_id, sort_order);
create index if not exists idx_edit_source_clips_user
  on public.edit_source_clips (user_id);

-- =========================================================================
-- edit_analysis
-- =========================================================================
create table if not exists public.edit_analysis (
  id uuid primary key default gen_random_uuid(),
  edit_project_id uuid not null references public.edit_projects(id) on delete cascade,
  clip_id uuid not null references public.edit_source_clips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  transcript_json jsonb,
  hook_candidates_json jsonb not null default '[]'::jsonb,
  silence_ranges_json jsonb not null default '[]'::jsonb,
  retention_moments_json jsonb not null default '[]'::jsonb,
  extracted_topics_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_edit_analysis_project
  on public.edit_analysis (edit_project_id);
create index if not exists idx_edit_analysis_clip
  on public.edit_analysis (clip_id);

-- =========================================================================
-- edit_plans
-- =========================================================================
create table if not exists public.edit_plans (
  id uuid primary key default gen_random_uuid(),
  edit_project_id uuid not null references public.edit_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1,
  plan_json jsonb not null,
  created_by_system boolean not null default true,
  created_at timestamptz not null default now(),
  unique (edit_project_id, version)
);

create index if not exists idx_edit_plans_project_version
  on public.edit_plans (edit_project_id, version desc);

-- =========================================================================
-- render_jobs (new — do NOT confuse with legacy ai_edit_jobs)
-- =========================================================================
create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  edit_project_id uuid not null references public.edit_projects(id) on delete cascade,
  edit_plan_id uuid not null references public.edit_plans(id) on delete cascade,
  render_kind text not null default 'preview',
  worker_target text,
  worker_id text,
  status text not null default 'queued',
  priority integer not null default 100,
  progress integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  output_url text,
  preview_url text,
  logs_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.render_jobs drop constraint if exists render_jobs_status_check;
alter table public.render_jobs add constraint render_jobs_status_check
  check (status in ('queued','in_progress','completed','failed','cancelled'));

alter table public.render_jobs drop constraint if exists render_jobs_kind_check;
alter table public.render_jobs add constraint render_jobs_kind_check
  check (render_kind in ('preview','final'));

-- Critical: index used by the claim function's inner SELECT.
create index if not exists idx_render_jobs_claim
  on public.render_jobs (status, priority desc, created_at)
  where status = 'queued';

create index if not exists idx_render_jobs_user_created
  on public.render_jobs (user_id, created_at desc);
create index if not exists idx_render_jobs_project
  on public.render_jobs (edit_project_id);

-- =========================================================================
-- worker_nodes (admin/service-role only)
-- =========================================================================
create table if not exists public.worker_nodes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  machine_type text,
  hostname text,
  capabilities_json jsonb not null default '[]'::jsonb,
  max_concurrent_jobs integer not null default 1,
  status text not null default 'offline',
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.worker_nodes drop constraint if exists worker_nodes_status_check;
alter table public.worker_nodes add constraint worker_nodes_status_check
  check (status in ('online','offline','draining','error'));

create index if not exists idx_worker_nodes_status
  on public.worker_nodes (status, last_heartbeat_at);

-- =========================================================================
-- updated_at triggers
-- =========================================================================
create or replace function public.edit_builder_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_edit_projects_touch on public.edit_projects;
create trigger trg_edit_projects_touch
  before update on public.edit_projects
  for each row execute function public.edit_builder_touch_updated_at();

drop trigger if exists trg_render_jobs_touch on public.render_jobs;
create trigger trg_render_jobs_touch
  before update on public.render_jobs
  for each row execute function public.edit_builder_touch_updated_at();

-- =========================================================================
-- RLS — user_id based, mirrors ai_edit_jobs pattern
-- =========================================================================
alter table public.edit_projects     enable row level security;
alter table public.edit_source_clips enable row level security;
alter table public.edit_analysis     enable row level security;
alter table public.edit_plans        enable row level security;
alter table public.render_jobs       enable row level security;
alter table public.worker_nodes      enable row level security;

do $$
declare
  t text;
  tbls text[] := array['edit_projects','edit_source_clips','edit_analysis','edit_plans','render_jobs'];
begin
  foreach t in array tbls loop
    execute format($f$
      drop policy if exists %I on public.%I;
      create policy %I on public.%I for all
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    $f$, t || '_owner_all', t, t || '_owner_all', t);
  end loop;
end $$;

-- worker_nodes: no user-level access. Service role only (bypasses RLS by default).
-- Adding an explicit deny-all policy so no anon/authenticated role can read it.
drop policy if exists worker_nodes_deny_all on public.worker_nodes;
create policy worker_nodes_deny_all on public.worker_nodes
  for all to authenticated, anon
  using (false) with check (false);

-- =========================================================================
-- claim_render_job() — atomic single-job claim for worker polling
-- =========================================================================
-- Usage from the worker: supabase.rpc('claim_render_job', { p_worker_id: 'mac-mini-1' })
-- Returns the claimed row, or null if nothing to claim.
-- Uses SKIP LOCKED so multiple workers can poll concurrently without blocking.
create or replace function public.claim_render_job(p_worker_id text)
returns public.render_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.render_jobs;
begin
  update public.render_jobs j
  set status = 'in_progress',
      worker_id = p_worker_id,
      started_at = now(),
      attempts = j.attempts + 1,
      updated_at = now()
  where j.id = (
    select id from public.render_jobs
    where status = 'queued'
      and attempts < max_attempts
    order by priority desc, created_at asc
    for update skip locked
    limit 1
  )
  returning * into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_render_job(text) from public;
grant execute on function public.claim_render_job(text) to service_role;

-- =========================================================================
-- append_render_log() — append one step log entry to a render job
-- =========================================================================
create or replace function public.append_render_log(
  p_job_id uuid,
  p_entry jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.render_jobs
  set logs_json = coalesce(logs_json, '[]'::jsonb) || jsonb_build_array(
        p_entry || jsonb_build_object('at', to_jsonb(now()))
      ),
      updated_at = now()
  where id = p_job_id;
end;
$$;

revoke all on function public.append_render_log(uuid, jsonb) from public;
grant execute on function public.append_render_log(uuid, jsonb) to service_role;
