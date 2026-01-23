-- 011_scripts_system.sql
-- Scripts System: Templates + structured scripts + rewrite history + video locking

create extension if not exists pgcrypto;

-- updated_at trigger function
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 1) Templates table
create table if not exists public.script_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  tags text[] default '{}',
  template_json jsonb not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_script_templates_updated_at on public.script_templates;
create trigger trg_script_templates_updated_at
before update on public.script_templates
for each row execute function public.set_updated_at();

create index if not exists idx_script_templates_category on public.script_templates(category);
create index if not exists idx_script_templates_tags_gin on public.script_templates using gin(tags);

-- 2) Rewrite history table
create table if not exists public.script_rewrites (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null,
  product_context_json jsonb,
  rewrite_prompt text,
  rewrite_result_json jsonb,
  rewrite_result_text text,
  model text,
  created_by text,
  created_at timestamptz not null default now()
);

-- Add FK to scripts if scripts exists, otherwise leave as-is (Supabase will error if scripts missing)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='scripts'
  ) then
    alter table public.script_rewrites
      drop constraint if exists script_rewrites_script_id_fkey;
    alter table public.script_rewrites
      add constraint script_rewrites_script_id_fkey
      foreign key (script_id) references public.scripts(id) on delete cascade;
  end if;
end $$;

-- 3) Extend existing scripts table (do NOT recreate it)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='scripts'
  ) then
    alter table public.scripts
      add column if not exists template_id uuid null references public.script_templates(id) on delete set null,
      add column if not exists product_id uuid null,
      add column if not exists title text null,
      add column if not exists script_json jsonb null,
      add column if not exists script_text text null,
      add column if not exists status text not null default 'DRAFT',
      add column if not exists version int not null default 1,
      add column if not exists created_by text null,
      add column if not exists updated_at timestamptz not null default now();

    drop trigger if exists trg_scripts_updated_at on public.scripts;
    create trigger trg_scripts_updated_at
    before update on public.scripts
    for each row execute function public.set_updated_at();

    create index if not exists idx_scripts_status on public.scripts(status);
    create index if not exists idx_scripts_template_id on public.scripts(template_id);
  else
    raise exception 'public.scripts table does not exist. This repo already had /api/scripts; expected scripts table.';
  end if;
end $$;

-- 4) Extend videos table for locking
alter table public.videos
  add column if not exists script_id uuid null references public.scripts(id) on delete set null;

alter table public.videos
  add column if not exists script_locked_json jsonb null;

alter table public.videos
  add column if not exists script_locked_text text null;
