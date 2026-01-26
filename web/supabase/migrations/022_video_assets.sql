-- 022_video_assets.sql
-- Structured asset management for videos
-- Tracks raw, edit, export, final, and other asset types per video

-- Create asset_type enum for type safety
do $$
begin
  if not exists (select 1 from pg_type where typname = 'video_asset_type') then
    create type video_asset_type as enum (
      'raw',
      'edit_project',
      'export',
      'final_mp4',
      'thumbnail',
      'screenshot',
      'misc'
    );
  end if;
end $$;

-- Create video_assets table
create table if not exists public.video_assets (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,

  -- Asset classification
  asset_type video_asset_type not null,
  storage_provider text not null default 'local',

  -- Asset location and metadata
  uri text not null,
  file_name text not null,
  mime_type text,
  byte_size bigint,
  checksum text,

  -- Audit
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Soft delete support
  deleted_at timestamptz
);

-- Indexes for common queries
create index if not exists idx_video_assets_video_id
  on public.video_assets(video_id);

create index if not exists idx_video_assets_video_type
  on public.video_assets(video_id, asset_type);

create index if not exists idx_video_assets_type
  on public.video_assets(asset_type);

-- Partial index for non-deleted assets
create index if not exists idx_video_assets_video_active
  on public.video_assets(video_id)
  where deleted_at is null;

-- Unique constraint: one active asset per type per video (soft delete aware)
create unique index if not exists idx_video_assets_unique_type
  on public.video_assets(video_id, asset_type)
  where deleted_at is null;

-- Updated_at trigger
create or replace function public.video_assets_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_video_assets_updated_at on public.video_assets;
create trigger trg_video_assets_updated_at
before update on public.video_assets
for each row execute function public.video_assets_set_updated_at();

-- RLS Policies
-- Note: videos table uses account_id for org scoping. We inherit access via video_id FK.
-- Service role bypasses RLS automatically.
alter table public.video_assets enable row level security;

-- Allow authenticated users to read assets (scoped by video access in app layer)
create policy "video_assets_select" on public.video_assets
  for select using (true);

create policy "video_assets_insert" on public.video_assets
  for insert with check (true);

create policy "video_assets_update" on public.video_assets
  for update using (true);

create policy "video_assets_delete" on public.video_assets
  for delete using (true);

-- Comments for documentation
comment on table public.video_assets is 'Structured asset tracking per video (raw, edit, final, etc.)';
comment on column public.video_assets.asset_type is 'Type: raw, edit_project, export, final_mp4, thumbnail, screenshot, misc';
comment on column public.video_assets.storage_provider is 'Storage backend: local, gdrive, s3, etc.';
comment on column public.video_assets.uri is 'Full path or URL to the asset';
comment on column public.video_assets.checksum is 'Optional SHA-256 or MD5 hash for integrity verification';
comment on column public.video_assets.deleted_at is 'Soft delete timestamp; NULL = active';
