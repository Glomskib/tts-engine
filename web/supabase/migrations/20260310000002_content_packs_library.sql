-- content_packs library columns: favorited, notes, updated_at
-- Run AFTER 20260310_content_packs.sql

alter table content_packs add column if not exists favorited boolean not null default false;
alter table content_packs add column if not exists notes text;
alter table content_packs add column if not exists updated_at timestamptz not null default now();

-- Index for favorited packs lookup
create index if not exists idx_content_packs_favorited on content_packs(user_id, favorited, created_at desc)
  where favorited = true;
