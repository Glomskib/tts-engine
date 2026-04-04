-- Migration: Create email_subscribers table
-- Used by: lib/email/unsubscribe.ts, app/api/lead-magnet/route.ts
-- Purpose: Lead capture, email compliance (CAN-SPAM unsubscribe tokens)

create table if not exists public.email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  source text default 'organic',
  subscribed boolean default true,
  unsubscribe_token text,
  unsubscribed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Unique constraint on email (required for upsert onConflict: 'email')
create unique index if not exists idx_email_subscribers_email
  on public.email_subscribers (email);

-- Index for unsubscribe token lookup
create index if not exists idx_email_subscribers_token
  on public.email_subscribers (unsubscribe_token)
  where unsubscribe_token is not null;

alter table public.email_subscribers enable row level security;

-- Service role only (no direct user access — managed by API routes)
create policy "Service role full access" on public.email_subscribers
  for all using (true) with check (true);

-- Updated_at trigger
create or replace function public.email_subscribers_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger email_subscribers_updated_at
  before update on public.email_subscribers
  for each row execute function public.email_subscribers_set_updated_at();
