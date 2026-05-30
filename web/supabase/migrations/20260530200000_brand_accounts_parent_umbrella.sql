-- Migration: 20260530200000_brand_accounts_parent_umbrella
-- Purpose: Allow multiple Facebook pages per umbrella brand (the "farm" pattern).
-- Created 2026-05-30 — after 40 farm pages were created on FB and we hit the
--   unique(brand, platform) constraint trying to register them.
--
-- Schema changes:
--   1. Drop unique(brand, platform) — replace with unique(brand, platform, page_id)
--      so we can have many rows for ("Zebby's World", facebook) — one per page.
--   2. Add parent_brand column — umbrella brand each child rolls up to.
--      e.g. brand="POTS Patrol" parent_brand="Zebby's World"
--      Original umbrella rows have parent_brand = NULL (they ARE the umbrella).
--   3. Index parent_brand for the umbrella → children lookup.
--
-- Safe to run more than once.

-- Step 1: drop the old constraint if it exists
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'marketing_brand_accounts_brand_platform_key'
      and conrelid = 'public.marketing_brand_accounts'::regclass
  ) then
    alter table public.marketing_brand_accounts
      drop constraint marketing_brand_accounts_brand_platform_key;
  end if;
end$$;

-- Step 2: add parent_brand column (nullable; null = this row IS an umbrella)
alter table public.marketing_brand_accounts
  add column if not exists parent_brand text;

comment on column public.marketing_brand_accounts.parent_brand is
  'Umbrella brand this row rolls up to. NULL means this row IS an umbrella brand. e.g. brand="POTS Patrol" parent_brand="Zebby''s World".';

-- Step 3: add new uniqueness — one row per (brand, platform, page_id).
-- Allows many pages per (brand, platform) because page_id differentiates them.
-- Uses coalesce(page_id, '__no_page__') so rows without a page_id (e.g. twitter,
-- linkedin) still get uniqueness on (brand, platform).
create unique index if not exists idx_marketing_brand_accounts_brand_platform_page
  on public.marketing_brand_accounts (brand, platform, coalesce(page_id, '__no_page__'));

-- Step 4: index parent_brand → fast umbrella lookup
create index if not exists idx_marketing_brand_accounts_parent
  on public.marketing_brand_accounts (parent_brand)
  where parent_brand is not null;

-- Step 5: helper view — every umbrella + its children resolved together
create or replace view public.marketing_brand_umbrella_view as
select
  coalesce(parent_brand, brand) as umbrella_brand,
  brand,
  platform,
  account_id,
  page_id,
  enabled,
  meta,
  case when parent_brand is null then 'umbrella' else 'farm' end as row_kind
from public.marketing_brand_accounts;

comment on view public.marketing_brand_umbrella_view is
  'Convenience view: every brand_account row joined with its umbrella. Use this for "give me every page under Zebby''s World" queries.';
