-- comment_themes: grouped comment insights surfaced as content opportunities
-- Built on top of ri_comments + ri_comment_analysis

create table if not exists comment_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  theme text not null,
  category text not null default 'question'
    check (category in ('question', 'objection', 'request', 'pain_point', 'praise_pattern', 'controversy')),
  comment_count int not null default 0,
  example_comments jsonb not null default '[]',
  content_angle text not null default '',
  suggested_actions jsonb not null default '[]',
  opportunity_score int not null default 0,
  source_video_ids jsonb not null default '[]',
  dismissed boolean not null default false,
  created_at timestamptz not null default now()
);

-- Index for fast lookup by user
create index if not exists idx_comment_themes_user on comment_themes(user_id, created_at desc);

-- RLS: users can only see their own themes
alter table comment_themes enable row level security;

create policy "Users can manage their own comment themes"
  on comment_themes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
