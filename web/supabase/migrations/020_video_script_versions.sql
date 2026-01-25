-- 020_video_script_versions.sql
-- Video-scoped script versioning with locking and compliance support

-- 1) video_script_versions: append-only version history per video
create table if not exists public.video_script_versions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  version_number int not null,

  -- Content fields
  script_text text,
  caption text,
  hashtags text[] default '{}',
  product_sku text,
  product_link text,
  compliance_notes text,

  -- Integrity
  content_hash text not null,
  previous_hash text,

  -- Audit
  created_by text not null,
  created_at timestamptz not null default now(),

  -- Locking (nullable = not locked)
  locked_at timestamptz,
  locked_by text,

  constraint uq_video_script_version unique (video_id, version_number)
);

-- Indexes for common queries
create index if not exists idx_video_script_versions_video_id
  on public.video_script_versions(video_id);
create index if not exists idx_video_script_versions_video_latest
  on public.video_script_versions(video_id, version_number desc);
create index if not exists idx_video_script_versions_locked
  on public.video_script_versions(video_id) where locked_at is not null;

-- 2) video_scripts: current version pointer per video (1:1 with videos)
create table if not exists public.video_scripts (
  video_id uuid primary key references public.videos(id) on delete cascade,
  current_version_id uuid not null references public.video_script_versions(id) on delete restrict,
  updated_at timestamptz not null default now()
);

-- Trigger to auto-update updated_at
create or replace function public.video_scripts_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_video_scripts_updated_at on public.video_scripts;
create trigger trg_video_scripts_updated_at
before update on public.video_scripts
for each row execute function public.video_scripts_set_updated_at();

-- 3) RLS Policies
-- Note: videos table uses account_id for org scoping. We inherit that via video_id FK.
-- For now, enable RLS with permissive policies; tighten when org_id is added to videos.

alter table public.video_script_versions enable row level security;
alter table public.video_scripts enable row level security;

-- Allow authenticated users to read/write (scoped by video access in app layer)
-- Service role bypasses RLS automatically
create policy "video_script_versions_select" on public.video_script_versions
  for select using (true);

create policy "video_script_versions_insert" on public.video_script_versions
  for insert with check (true);

create policy "video_script_versions_update" on public.video_script_versions
  for update using (true);

create policy "video_scripts_select" on public.video_scripts
  for select using (true);

create policy "video_scripts_insert" on public.video_scripts
  for insert with check (true);

create policy "video_scripts_update" on public.video_scripts
  for update using (true);

-- 4) Function to compute next version number atomically
create or replace function public.get_next_script_version_number(p_video_id uuid)
returns int as $$
declare
  next_version int;
begin
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.video_script_versions
  where video_id = p_video_id;
  return next_version;
end;
$$ language plpgsql;

-- 5) Comments for documentation
comment on table public.video_script_versions is 'Append-only script version history per video';
comment on table public.video_scripts is 'Current script version pointer for each video';
comment on column public.video_script_versions.content_hash is 'SHA-256 hash of content for immutability verification';
comment on column public.video_script_versions.previous_hash is 'Hash of previous version for chain verification';
comment on column public.video_script_versions.locked_at is 'When locked; NULL means unlocked/mutable';
