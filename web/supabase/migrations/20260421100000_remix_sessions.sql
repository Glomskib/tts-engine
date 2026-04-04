-- Remix Sessions — persists remix results for logged-in users
create table if not exists remix_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references auth.users(id) on delete cascade,
  source_url text not null,
  platform text not null default 'tiktok',
  original_hook text not null,
  remix_script jsonb,
  hooks jsonb default '[]'::jsonb,
  visual_hooks jsonb default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Index for history queries
create index if not exists idx_remix_sessions_workspace_created
  on remix_sessions (workspace_id, created_at desc);

-- RLS
alter table remix_sessions enable row level security;

create policy "Users manage own remix sessions"
  on remix_sessions for all
  using (auth.uid() = workspace_id)
  with check (auth.uid() = workspace_id);

-- Public read for shareable result pages (any logged-in remix is viewable)
create policy "Public can view remix sessions"
  on remix_sessions for select
  using (workspace_id is not null);
