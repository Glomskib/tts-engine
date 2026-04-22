-- content_packs: creator-facing content packs (bundled hooks + script + visual hooks)
-- One pack per idea/topic, generated via the Content Pack Generator

create table if not exists content_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null default 'topic'
    check (source_type in ('opportunity', 'product', 'topic', 'transcript', 'comment', 'blank')),
  topic text not null,
  hooks jsonb not null default '[]',
  script jsonb,
  visual_hooks jsonb not null default '[]',
  title_variants jsonb not null default '[]',
  meta jsonb not null default '{}',
  status jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Index for fast lookup by user
create index if not exists idx_content_packs_user on content_packs(user_id, created_at desc);

-- RLS: users can only see their own content packs
alter table content_packs enable row level security;

create policy "Users can manage their own content packs"
  on content_packs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
