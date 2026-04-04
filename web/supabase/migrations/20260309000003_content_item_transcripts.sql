-- Migration: Create content_item_transcripts table
-- Used by: lib/editing/analyzeTranscript.ts
-- Purpose: Stores transcript segments for editing suggestion generation

create table if not exists public.content_item_transcripts (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null,
  segments jsonb not null default '[]',
  source text default 'whisper',
  language text default 'en',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for content item lookup (most recent transcript)
create index if not exists idx_content_item_transcripts_item
  on public.content_item_transcripts (content_item_id, created_at desc);

alter table public.content_item_transcripts enable row level security;

-- Service role only
create policy "Service role full access" on public.content_item_transcripts
  for all using (true) with check (true);

-- Updated_at trigger
create or replace function public.content_item_transcripts_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger content_item_transcripts_updated_at
  before update on public.content_item_transcripts
  for each row execute function public.content_item_transcripts_set_updated_at();
