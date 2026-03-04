-- Migration: 20260303100000_marketing_brand_accounts
-- Table: marketing_brand_accounts
-- Purpose: Configurable brand → Late.dev account ID mapping (admin-editable)

create table if not exists public.marketing_brand_accounts (
  id          uuid primary key default gen_random_uuid(),
  brand       text not null,
  platform    text not null,
  account_id  text not null,
  page_id     text,
  enabled     boolean not null default true,
  meta        jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (brand, platform)
);

create index if not exists idx_mba_brand_enabled
  on public.marketing_brand_accounts (brand, enabled);

alter table public.marketing_brand_accounts enable row level security;
drop policy if exists "mba_service_only" on public.marketing_brand_accounts;
create policy "mba_service_only" on public.marketing_brand_accounts
  for all using (public.is_service_role());

-- ── Seed: default brand → account mapping ────────────────────────
insert into public.marketing_brand_accounts (brand, platform, account_id, page_id) values
  ('Making Miles Matter', 'facebook',  '699e6a2f8ab8ae478b4279b6', '553582747844417'),
  ('Making Miles Matter', 'twitter',   '699e663d8ab8ae478b4274a2', null),
  ('Making Miles Matter', 'linkedin',  '699e68698ab8ae478b42776e', null),
  ('Making Miles Matter', 'tiktok',    '699e65138ab8ae478b427330', null),
  ('Making Miles Matter', 'youtube',   '699e652b8ab8ae478b427341', null),
  ('Making Miles Matter', 'pinterest', '699e66cc8ab8ae478b427553', null),
  ('Zebby''s World',      'facebook',  '699e6a2f8ab8ae478b4279b6', '673094745879999'),
  ('Zebby''s World',      'twitter',   '699e663d8ab8ae478b4274a2', null),
  ('Zebby''s World',      'linkedin',  '699e68698ab8ae478b42776e', null),
  ('FlashFlow',           'twitter',   '699e663d8ab8ae478b4274a2', null),
  ('FlashFlow',           'linkedin',  '699e68698ab8ae478b42776e', null)
on conflict (brand, platform) do nothing;
