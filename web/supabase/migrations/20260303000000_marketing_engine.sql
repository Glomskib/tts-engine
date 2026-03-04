-- Migration: 20260303000000_marketing_engine
-- Tables: marketing_posts, marketing_schedules, marketing_runs, marketing_assets
-- Purpose: FlashFlow Marketing Engine MVP — Late.dev integration, repurpose pipeline, claim risk

-- ── marketing_posts ──────────────────────────────────────────────
-- Tracks every social post through the lifecycle: pending → scheduled → published | failed
create table if not exists public.marketing_posts (
  id            uuid primary key default gen_random_uuid(),
  content       text not null,
  media_items   jsonb default '[]'::jsonb,
  platforms     jsonb default '[]'::jsonb,
  status        text not null default 'pending'
                  check (status in ('pending', 'scheduled', 'published', 'failed', 'cancelled')),
  source        text not null default 'manual',
  scheduled_for timestamptz,
  late_post_id  text,
  claim_risk_score integer default 0,
  claim_risk_flags jsonb default '[]'::jsonb,
  error         text,
  meta          jsonb default '{}'::jsonb,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_marketing_posts_status
  on public.marketing_posts (status, created_at desc);

create unique index if not exists idx_marketing_posts_late_id
  on public.marketing_posts (late_post_id)
  where late_post_id is not null;

create index if not exists idx_marketing_posts_source
  on public.marketing_posts (source, created_at desc);

alter table public.marketing_posts enable row level security;
drop policy if exists "marketing_posts_service_only" on public.marketing_posts;
create policy "marketing_posts_service_only" on public.marketing_posts
  for all using (public.is_service_role());

-- ── marketing_schedules ──────────────────────────────────────────
-- Recurring schedule definitions (e.g. "post cycling intel every Mon/Wed/Fri at 9am")
create table if not exists public.marketing_schedules (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  cron_expression text not null,
  platforms       jsonb default '[]'::jsonb,
  source_pipeline text not null,
  enabled         boolean not null default true,
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  meta            jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_marketing_schedules_name
  on public.marketing_schedules (name);

alter table public.marketing_schedules enable row level security;
drop policy if exists "marketing_schedules_service_only" on public.marketing_schedules;
create policy "marketing_schedules_service_only" on public.marketing_schedules
  for all using (public.is_service_role());

-- ── marketing_runs ───────────────────────────────────────────────
-- Execution log for each scheduler invocation
create table if not exists public.marketing_runs (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid references public.marketing_schedules(id) on delete set null,
  job          text not null,
  status       text not null default 'running'
                 check (status in ('running', 'ok', 'error', 'skipped')),
  posts_created integer default 0,
  posts_failed  integer default 0,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  error        text,
  meta         jsonb default '{}'::jsonb
);

create index if not exists idx_marketing_runs_job
  on public.marketing_runs (job, started_at desc);

create index if not exists idx_marketing_runs_schedule
  on public.marketing_runs (schedule_id, started_at desc)
  where schedule_id is not null;

alter table public.marketing_runs enable row level security;
drop policy if exists "marketing_runs_service_only" on public.marketing_runs;
create policy "marketing_runs_service_only" on public.marketing_runs
  for all using (public.is_service_role());

-- ── marketing_assets ─────────────────────────────────────────────
-- Media files tracked for repurpose pipeline (source videos, transcripts, thumbnails)
create table if not exists public.marketing_assets (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid references public.marketing_posts(id) on delete cascade,
  asset_type     text not null check (asset_type in ('video', 'image', 'audio', 'transcript', 'thumbnail')),
  url            text not null,
  platform       text,
  source_url     text,
  file_size      bigint,
  duration_secs  integer,
  meta           jsonb default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_marketing_assets_post
  on public.marketing_assets (post_id);

create index if not exists idx_marketing_assets_type
  on public.marketing_assets (asset_type, created_at desc);

alter table public.marketing_assets enable row level security;
drop policy if exists "marketing_assets_service_only" on public.marketing_assets;
create policy "marketing_assets_service_only" on public.marketing_assets
  for all using (public.is_service_role());
