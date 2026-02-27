-- Overlay Clip Index — schema for clip discovery, analysis, and publishing
-- Tables: ff_clip_candidates, ff_clip_analysis, ff_clip_index

-- ============================================================================
-- 1. ff_clip_candidates — raw discovered clips (YouTube metadata only)
-- ============================================================================

create table if not exists ff_clip_candidates (
  id          uuid primary key default gen_random_uuid(),
  source_url  text not null,
  video_id    text not null,
  platform    text not null default 'youtube',
  title       text,
  channel     text,
  view_count  bigint,
  duration_s  integer,
  published_at timestamptz,
  thumbnail   text,
  query_used  text,
  status      text not null default 'new'
                check (status in ('new', 'analyzing', 'analyzed', 'published', 'rejected', 'error')),
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Dedup: one row per source URL
create unique index if not exists idx_ff_clip_candidates_source_url
  on ff_clip_candidates (source_url);

create index if not exists idx_ff_clip_candidates_status
  on ff_clip_candidates (status);

create index if not exists idx_ff_clip_candidates_created
  on ff_clip_candidates (created_at desc);

-- ============================================================================
-- 2. ff_clip_analysis — transcript + scoring per candidate
-- ============================================================================

create table if not exists ff_clip_analysis (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid not null references ff_clip_candidates(id) on delete cascade,
  transcript_source text not null default 'youtube',
  transcript_text text,
  transcript_len  integer not null default 0,
  ingredients     jsonb not null default '[]'::jsonb,
  primary_ingredient text,
  product_types   jsonb not null default '[]'::jsonb,
  ingredient_density real not null default 0,
  format_score    real not null default 0,
  obscurity_boost real not null default 0,
  confidence      real not null default 0,
  best_moments    jsonb not null default '[]'::jsonb,
  risk_flags      jsonb not null default '[]'::jsonb,
  risk_level      text not null default 'low'
                    check (risk_level in ('low', 'med', 'high')),
  needs_transcription boolean not null default false,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ff_clip_analysis_candidate
  on ff_clip_analysis (candidate_id);

-- GIN index for ingredient queries
create index if not exists idx_ff_clip_analysis_ingredients
  on ff_clip_analysis using gin (ingredients);

-- ============================================================================
-- 3. ff_clip_index — published clips ready for the UI
-- ============================================================================

create table if not exists ff_clip_index (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references ff_clip_candidates(id) on delete cascade,
  analysis_id       uuid not null references ff_clip_analysis(id) on delete cascade,
  source_url        text not null,
  video_id          text not null,
  title             text,
  channel           text,
  thumbnail         text,
  duration_s        integer,
  primary_ingredient text not null,
  product_types     jsonb not null default '[]'::jsonb,
  ingredients       jsonb not null default '[]'::jsonb,
  best_moments      jsonb not null default '[]'::jsonb,
  risk_flags        jsonb not null default '[]'::jsonb,
  risk_level        text not null default 'low',
  confidence        real not null default 0,
  format_score      real not null default 0,
  tags              jsonb not null default '[]'::jsonb,
  visibility        text not null default 'pro'
                      check (visibility in ('pro', 'public', 'internal')),
  published_at      timestamptz not null default now(),
  meta              jsonb not null default '{}'::jsonb
);

create index if not exists idx_ff_clip_index_ingredient_published
  on ff_clip_index (primary_ingredient, published_at desc);

create index if not exists idx_ff_clip_index_published
  on ff_clip_index (published_at desc);

create unique index if not exists idx_ff_clip_index_candidate
  on ff_clip_index (candidate_id);
