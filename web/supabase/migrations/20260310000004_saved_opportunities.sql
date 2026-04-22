-- saved_opportunities: user bookmarks for trend_cluster opportunities
-- Used by the Opportunity Scanner (creator-facing)

create table if not exists saved_opportunities (
  user_id uuid not null references auth.users(id) on delete cascade,
  cluster_id uuid not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, cluster_id)
);

-- Index for fast lookup by user
create index if not exists idx_saved_opportunities_user on saved_opportunities(user_id);

-- RLS: users can only see their own saved opportunities
alter table saved_opportunities enable row level security;

create policy "Users can manage their own saved opportunities"
  on saved_opportunities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
