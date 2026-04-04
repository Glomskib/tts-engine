-- saved_visual_hooks: user-bookmarked visual hook ideas
-- Used by the Visual Hooks panel across Content Studio, Hooks, and Opportunities

create table if not exists saved_visual_hooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  action text not null,
  shot_type text not null default 'close-up',
  setup text not null default '',
  pairs_with text,
  energy text not null default 'punchy',
  why_it_works text,
  saved_at timestamptz not null default now()
);

-- Index for fast lookup by user
create index if not exists idx_saved_visual_hooks_user on saved_visual_hooks(user_id);

-- RLS: users can only see their own saved visual hooks
alter table saved_visual_hooks enable row level security;

create policy "Users can manage their own saved visual hooks"
  on saved_visual_hooks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
