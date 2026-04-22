-- V1 Create flow: clip sets library + per-user generation log for usage gating.
-- Surface-layer addition — does not modify existing tables.

create table if not exists public.v1_clip_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  input_mode text not null check (input_mode in ('product', 'tiktok_url', 'niche')),
  input_value text not null,
  niche text,
  tone text,
  clips jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists v1_clip_sets_user_created_idx
  on public.v1_clip_sets (user_id, created_at desc);

alter table public.v1_clip_sets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'v1_clip_sets'
      and policyname = 'v1_clip_sets_owner'
  ) then
    create policy v1_clip_sets_owner on public.v1_clip_sets
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.v1_generation_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  clips_requested int not null,
  clips_returned int not null,
  input_mode text not null,
  source text not null default 'llm',
  created_at timestamptz not null default now()
);

create index if not exists v1_generation_events_user_created_idx
  on public.v1_generation_events (user_id, created_at desc);

alter table public.v1_generation_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'v1_generation_events'
      and policyname = 'v1_generation_events_owner_read'
  ) then
    create policy v1_generation_events_owner_read on public.v1_generation_events
      for select using (auth.uid() = user_id);
  end if;
end $$;
