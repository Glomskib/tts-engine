-- Migration: Create email_queue table
-- Used by: lib/email/scheduler.ts (7 call sites)
-- Purpose: Queues email sequences (onboarding, lead_magnet, winback, etc.)
-- Processed by cron every 6 hours

create table if not exists public.email_queue (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  user_name text,
  sequence text not null,
  step integer not null default 0,
  send_at timestamptz not null,
  sent boolean default false,
  sent_at timestamptz,
  error text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for processing: unsent emails ordered by send_at
create index if not exists idx_email_queue_pending
  on public.email_queue (send_at)
  where sent = false;

-- Index for finding queue entries by email
create index if not exists idx_email_queue_email
  on public.email_queue (user_email);

alter table public.email_queue enable row level security;

-- Service role only (processed by cron, not direct user access)
create policy "Service role full access" on public.email_queue
  for all using (true) with check (true);

-- Updated_at trigger
create or replace function public.email_queue_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger email_queue_updated_at
  before update on public.email_queue
  for each row execute function public.email_queue_set_updated_at();
