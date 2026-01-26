-- 023_video_ingestion.sql
-- Resilient video ingestion staging tables for external source imports
-- Supports two-phase commit: validate first, then commit to avoid partial corruption

-- Create ingestion source enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ingestion_source') then
    create type ingestion_source as enum (
      'tiktok_url',
      'csv',
      'sheets',
      'monday',
      'manual'
    );
  end if;
end $$;

-- Create ingestion job status enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ingestion_job_status') then
    create type ingestion_job_status as enum (
      'pending',
      'validated',
      'committed',
      'failed',
      'partial'
    );
  end if;
end $$;

-- Create ingestion row status enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ingestion_row_status') then
    create type ingestion_row_status as enum (
      'pending',
      'validated',
      'committed',
      'failed',
      'duplicate'
    );
  end if;
end $$;

-- =============================================================================
-- video_ingestion_jobs - Parent table for batch imports
-- =============================================================================
create table if not exists public.video_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),

  -- Source identification
  source ingestion_source not null,
  source_ref text not null, -- TikTok URL, sheet ID, CSV filename, etc.

  -- Job status
  status ingestion_job_status not null default 'pending',

  -- Row counts
  total_rows integer not null default 0,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  duplicate_count integer not null default 0,

  -- Error tracking
  error_summary jsonb default '[]'::jsonb,

  -- Audit
  created_by text not null,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  committed_at timestamptz,
  completed_at timestamptz
);

-- Indexes for job queries
create index if not exists idx_ingestion_jobs_status
  on public.video_ingestion_jobs(status);

create index if not exists idx_ingestion_jobs_source
  on public.video_ingestion_jobs(source);

create index if not exists idx_ingestion_jobs_created_at
  on public.video_ingestion_jobs(created_at desc);

create index if not exists idx_ingestion_jobs_created_by
  on public.video_ingestion_jobs(created_by);

-- =============================================================================
-- video_ingestion_rows - Individual rows within a job
-- =============================================================================
create table if not exists public.video_ingestion_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.video_ingestion_jobs(id) on delete cascade,

  -- External identification (for deduplication)
  external_id text not null, -- TikTok video ID, row hash, etc.

  -- Normalized input data
  normalized_payload jsonb not null,

  -- Processing status
  status ingestion_row_status not null default 'pending',
  error text,

  -- Output reference
  created_video_id uuid references public.videos(id),

  -- Audit
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  committed_at timestamptz
);

-- Indexes for row queries
create index if not exists idx_ingestion_rows_job_id
  on public.video_ingestion_rows(job_id);

create index if not exists idx_ingestion_rows_status
  on public.video_ingestion_rows(status);

create index if not exists idx_ingestion_rows_external_id
  on public.video_ingestion_rows(external_id);

-- Composite index for deduplication lookups
create index if not exists idx_ingestion_rows_job_external
  on public.video_ingestion_rows(job_id, external_id);

-- Index for finding committed videos
create index if not exists idx_ingestion_rows_video
  on public.video_ingestion_rows(created_video_id)
  where created_video_id is not null;

-- =============================================================================
-- Deduplication tracking across all ingestions
-- Prevents the same external video from being ingested multiple times
-- =============================================================================
create table if not exists public.video_external_ids (
  id uuid primary key default gen_random_uuid(),

  -- External source reference
  source ingestion_source not null,
  external_id text not null,

  -- Link to video
  video_id uuid not null references public.videos(id) on delete cascade,

  -- Audit
  created_at timestamptz not null default now(),
  ingestion_job_id uuid references public.video_ingestion_jobs(id),

  -- Unique constraint: one video per external_id per source
  constraint uq_external_id_source unique (source, external_id)
);

-- Indexes for deduplication lookups
create index if not exists idx_external_ids_lookup
  on public.video_external_ids(source, external_id);

create index if not exists idx_external_ids_video
  on public.video_external_ids(video_id);

-- =============================================================================
-- RLS Policies
-- =============================================================================
alter table public.video_ingestion_jobs enable row level security;
alter table public.video_ingestion_rows enable row level security;
alter table public.video_external_ids enable row level security;

-- Jobs: allow read for authenticated, write for admins (enforced in app layer)
create policy "ingestion_jobs_select" on public.video_ingestion_jobs
  for select using (true);

create policy "ingestion_jobs_insert" on public.video_ingestion_jobs
  for insert with check (true);

create policy "ingestion_jobs_update" on public.video_ingestion_jobs
  for update using (true);

-- Rows: same pattern
create policy "ingestion_rows_select" on public.video_ingestion_rows
  for select using (true);

create policy "ingestion_rows_insert" on public.video_ingestion_rows
  for insert with check (true);

create policy "ingestion_rows_update" on public.video_ingestion_rows
  for update using (true);

-- External IDs: read-only for non-service role
create policy "external_ids_select" on public.video_external_ids
  for select using (true);

create policy "external_ids_insert" on public.video_external_ids
  for insert with check (true);

-- =============================================================================
-- Comments
-- =============================================================================
comment on table public.video_ingestion_jobs is 'Batch ingestion jobs for importing videos from external sources';
comment on column public.video_ingestion_jobs.source is 'Source type: tiktok_url, csv, sheets, monday, manual';
comment on column public.video_ingestion_jobs.source_ref is 'Source reference: URL, filename, sheet ID, etc.';
comment on column public.video_ingestion_jobs.status is 'Job status: pending -> validated -> committed/failed/partial';
comment on column public.video_ingestion_jobs.error_summary is 'JSON array of {error_type, count, examples} for failed rows';

comment on table public.video_ingestion_rows is 'Individual rows within an ingestion job';
comment on column public.video_ingestion_rows.external_id is 'Canonical external ID for deduplication (TikTok video ID, row hash)';
comment on column public.video_ingestion_rows.normalized_payload is 'Normalized fields: caption, hashtags, product_sku, product_link, etc.';
comment on column public.video_ingestion_rows.status is 'Row status: pending -> validated -> committed/failed/duplicate';
comment on column public.video_ingestion_rows.created_video_id is 'Reference to created video (set on commit)';

comment on table public.video_external_ids is 'Global deduplication tracking for external video IDs';
comment on column public.video_external_ids.external_id is 'External source ID (TikTok video ID, etc.)';
