-- 024_video_enrichment.sql
-- Async enrichment pipeline for TikTok URL ingestions
-- Fetches metadata from external sources with retry support

-- =============================================================================
-- Enrichment task status enum
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'enrichment_task_status') then
    create type enrichment_task_status as enum (
      'pending',
      'succeeded',
      'failed',
      'retrying'
    );
  end if;
end $$;

-- =============================================================================
-- video_enrichment_tasks - Async enrichment queue
-- =============================================================================
create table if not exists public.video_enrichment_tasks (
  id uuid primary key default gen_random_uuid(),

  -- Source identification
  source text not null default 'tiktok', -- 'tiktok', future: 'instagram', etc.
  external_id text not null, -- TikTok canonical video ID

  -- Link to video (nullable until ingestion commits)
  video_id uuid references public.videos(id) on delete cascade,

  -- Task status
  status enrichment_task_status not null default 'pending',

  -- Retry tracking
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  last_attempt_at timestamptz,
  next_retry_at timestamptz not null default now(),

  -- Extracted metadata (stored here until video_id is known)
  extracted_meta jsonb,

  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Unique constraint: one task per source/external_id
  constraint uq_enrichment_task_source_external unique (source, external_id)
);

-- Index for worker query: find pending/retrying tasks ready for processing
create index if not exists idx_enrichment_tasks_worker
  on public.video_enrichment_tasks(status, next_retry_at)
  where status in ('pending', 'retrying');

-- Index for video lookup
create index if not exists idx_enrichment_tasks_video
  on public.video_enrichment_tasks(video_id)
  where video_id is not null;

-- Index for status counts
create index if not exists idx_enrichment_tasks_status
  on public.video_enrichment_tasks(status);

-- Index for source filtering
create index if not exists idx_enrichment_tasks_source
  on public.video_enrichment_tasks(source);

-- =============================================================================
-- Add source_meta JSONB column to videos table
-- Stores enriched metadata from external sources
-- =============================================================================
alter table public.videos
  add column if not exists source_meta jsonb;

-- Index for querying videos by source metadata
create index if not exists idx_videos_source_meta
  on public.videos using gin (source_meta)
  where source_meta is not null;

-- =============================================================================
-- RLS Policies
-- =============================================================================
alter table public.video_enrichment_tasks enable row level security;

create policy "enrichment_tasks_select" on public.video_enrichment_tasks
  for select using (true);

create policy "enrichment_tasks_insert" on public.video_enrichment_tasks
  for insert with check (true);

create policy "enrichment_tasks_update" on public.video_enrichment_tasks
  for update using (true);

-- =============================================================================
-- Comments
-- =============================================================================
comment on table public.video_enrichment_tasks is 'Async enrichment queue for fetching metadata from external sources';
comment on column public.video_enrichment_tasks.source is 'Source platform: tiktok, instagram, etc.';
comment on column public.video_enrichment_tasks.external_id is 'Canonical external ID (TikTok video ID)';
comment on column public.video_enrichment_tasks.video_id is 'Link to video record (set when ingestion commits)';
comment on column public.video_enrichment_tasks.status is 'Task status: pending -> succeeded/failed/retrying';
comment on column public.video_enrichment_tasks.attempt_count is 'Number of enrichment attempts made';
comment on column public.video_enrichment_tasks.next_retry_at is 'When to retry (for exponential backoff)';
comment on column public.video_enrichment_tasks.extracted_meta is 'Extracted metadata before applying to video';

comment on column public.videos.source_meta is 'Enriched metadata from external sources (creator_handle, description, duration, etc.)';
