-- ============================================================
-- FlashFlow Script Rating System — Migration 001
-- Creates: script_events, script_patterns, script_quality_view
-- Strategy: per-script event log → aggregated per-script quality
--           → anonymized cross-account pattern pool.
-- ============================================================

-- 1. Raw event log. Append-only. One row per user action on a script.
-- This is the source of truth — we never overwrite, only aggregate.
create table if not exists public.script_events (
  id            bigserial primary key,
  script_id     uuid not null,
  account_id    uuid not null,            -- who owns the workspace
  user_id       uuid,                     -- who triggered it (nullable for system)
  event_type    text not null check (event_type in (
                  'viewed',      -- shown in picker
                  'copied',      -- copy button
                  'filmed',      -- marked as filmed
                  'skipped',     -- explicitly dismissed
                  'regenerated', -- asked for replacement
                  'thumb_up',    -- explicit positive
                  'thumb_down'   -- explicit negative
                )),
  weight        real not null default 1.0, -- allows tuning per event type later
  metadata      jsonb default '{}'::jsonb, -- e.g. dwell_ms, position_in_list
  created_at    timestamptz not null default now()
);

create index if not exists idx_script_events_script on public.script_events(script_id);
create index if not exists idx_script_events_account on public.script_events(account_id, created_at desc);
create index if not exists idx_script_events_type_created on public.script_events(event_type, created_at desc);

-- 2. Pattern dimensions extracted from each script at generation time.
-- This is what makes cross-account learning work — we never share the
-- script text, only the abstracted features.
create table if not exists public.script_patterns (
  script_id        uuid primary key,
  account_id       uuid not null,         -- kept for filtering, NOT exposed cross-account
  -- Abstract features (these are what the global pool learns from):
  hook_type        text,                  -- e.g. 'question', 'shock', 'storytime', 'POV', 'before_after'
  hook_length      int,                   -- words
  script_length    int,                   -- words
  niche            text,                  -- 'beauty', 'fitness', 'finance', etc.
  persona          text,                  -- 'expert', 'peer', 'skeptic', 'newbie'
  cta_style        text,                  -- 'urgency', 'curiosity', 'social_proof', 'none'
  tone             text,                  -- 'casual', 'authoritative', 'energetic', 'calm'
  product_category text,                  -- coarse TikTok Shop category
  pace             text,                  -- 'fast_cut', 'slow_build', 'mixed'
  features         jsonb default '{}'::jsonb, -- escape hatch for future signals
  created_at       timestamptz not null default now()
);

create index if not exists idx_script_patterns_hook on public.script_patterns(hook_type);
create index if not exists idx_script_patterns_niche on public.script_patterns(niche);
create index if not exists idx_script_patterns_account on public.script_patterns(account_id);

-- 3. Per-script aggregated quality score, refreshed via the function below.
-- Materialized so the generation endpoint can read it fast.
create table if not exists public.script_quality (
  script_id           uuid primary key references public.script_patterns(script_id) on delete cascade,
  total_views         int not null default 0,
  total_copies        int not null default 0,
  total_films         int not null default 0,
  total_skips         int not null default 0,
  total_regenerations int not null default 0,
  thumbs_up           int not null default 0,
  thumbs_down         int not null default 0,
  -- Score is the implicit-usage quality signal, range 0..1.
  -- See compute_script_score() below for the formula.
  quality_score       real not null default 0.5,
  -- Confidence increases with sample size (Wilson-style smoothing).
  -- Generation prompt only weights signals with confidence >= 0.3.
  confidence          real not null default 0.0,
  updated_at          timestamptz not null default now()
);

create index if not exists idx_script_quality_score on public.script_quality(quality_score desc);

-- 4. Score computation. Called by a trigger or scheduled job.
-- Formula reasoning:
--   - 'filmed' is the strongest positive signal (creator actually used it)
--   - 'copied' is a moderate positive
--   - 'skipped' / 'regenerated' are negative
--   - 'viewed' is neutral but increases denominator
--   - explicit thumbs override but rarely fire
create or replace function public.compute_script_score(p_script_id uuid)
returns void as $$
declare
  v_views int;  v_copies int;  v_films int;
  v_skips int;  v_regens int;  v_up int;  v_down int;
  v_signal real;  v_denominator real;
  v_score real;  v_confidence real;
begin
  select
    count(*) filter (where event_type = 'viewed'),
    count(*) filter (where event_type = 'copied'),
    count(*) filter (where event_type = 'filmed'),
    count(*) filter (where event_type = 'skipped'),
    count(*) filter (where event_type = 'regenerated'),
    count(*) filter (where event_type = 'thumb_up'),
    count(*) filter (where event_type = 'thumb_down')
  into v_views, v_copies, v_films, v_skips, v_regens, v_up, v_down
  from public.script_events
  where script_id = p_script_id;

  -- Weighted signal. Positive numerator, total denominator.
  v_signal := (v_films * 3.0) + (v_copies * 1.5) + (v_up * 2.0)
            - (v_skips * 1.0) - (v_regens * 1.5) - (v_down * 2.0);
  v_denominator := greatest(1.0, v_views + v_copies + v_films + v_skips + v_regens + v_up + v_down);

  -- Map to 0..1 using a logistic-ish smoothing
  v_score := 0.5 + 0.5 * tanh(v_signal / (2.0 * sqrt(v_denominator)));

  -- Confidence: more samples → higher. Cap at 1.0 around N=50.
  v_confidence := least(1.0, v_denominator / 50.0);

  insert into public.script_quality (
    script_id, total_views, total_copies, total_films,
    total_skips, total_regenerations, thumbs_up, thumbs_down,
    quality_score, confidence, updated_at
  ) values (
    p_script_id, v_views, v_copies, v_films,
    v_skips, v_regens, v_up, v_down,
    v_score, v_confidence, now()
  )
  on conflict (script_id) do update set
    total_views = excluded.total_views,
    total_copies = excluded.total_copies,
    total_films = excluded.total_films,
    total_skips = excluded.total_skips,
    total_regenerations = excluded.total_regenerations,
    thumbs_up = excluded.thumbs_up,
    thumbs_down = excluded.thumbs_down,
    quality_score = excluded.quality_score,
    confidence = excluded.confidence,
    updated_at = now();
end;
$$ language plpgsql;

-- 5. Trigger: recompute on each new event (cheap; aggregated query is indexed).
create or replace function public.trg_script_event_recompute()
returns trigger as $$
begin
  perform public.compute_script_score(new.script_id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_script_events_recompute on public.script_events;
create trigger trg_script_events_recompute
after insert on public.script_events
for each row execute function public.trg_script_event_recompute();

-- 6. The cross-account anonymous pattern pool.
-- This is the network-effect engine. Every account's quality scores
-- contribute to global pattern performance — but never the script text
-- and never the account_id. Generation prompt reads from this view.
create or replace view public.pattern_pool as
select
  sp.hook_type,
  sp.niche,
  sp.persona,
  sp.cta_style,
  sp.tone,
  sp.pace,
  sp.product_category,
  count(*)                                              as sample_size,
  avg(sq.quality_score)                                 as avg_quality,
  avg(sq.quality_score) filter (where sq.confidence > 0.3) as avg_quality_confident,
  -- Use a Bayesian shrinkage toward 0.5 for low-sample patterns
  ( (sum(sq.quality_score * sq.confidence) + 5.0 * 0.5)
    / (sum(sq.confidence) + 5.0) )                      as shrunk_score
from public.script_patterns sp
join public.script_quality sq using (script_id)
group by 1,2,3,4,5,6,7;

-- 7. Helper view: top N + bottom N patterns for a given niche.
-- The generation endpoint queries this to build positive/negative examples.
create or replace function public.get_pattern_signals(
  p_niche text default null,
  p_top_n int default 5,
  p_bottom_n int default 5,
  p_min_samples int default 3
)
returns table (
  bucket text,
  hook_type text,
  persona text,
  cta_style text,
  tone text,
  pace text,
  shrunk_score real,
  sample_size bigint
) as $$
begin
  return query
  -- TOP performers
  (select 'top'::text as bucket, pp.hook_type, pp.persona, pp.cta_style,
          pp.tone, pp.pace, pp.shrunk_score::real, pp.sample_size
   from public.pattern_pool pp
   where (p_niche is null or pp.niche = p_niche)
     and pp.sample_size >= p_min_samples
   order by pp.shrunk_score desc
   limit p_top_n)
  union all
  -- BOTTOM performers (the duds the AI should avoid)
  (select 'bottom'::text as bucket, pp.hook_type, pp.persona, pp.cta_style,
          pp.tone, pp.pace, pp.shrunk_score::real, pp.sample_size
   from public.pattern_pool pp
   where (p_niche is null or pp.niche = p_niche)
     and pp.sample_size >= p_min_samples
   order by pp.shrunk_score asc
   limit p_bottom_n);
end;
$$ language plpgsql stable;

-- 8. RLS: clients can only write/read their own events. The pattern_pool
-- view is intentionally global (anonymous aggregates), so we allow read.
--
-- DEFAULT policy assumes ONE USER = ONE ACCOUNT (account_id == auth.uid()).
-- If your FlashFlow schema has multi-user workspaces (account_members table
-- with user_id → account_id mapping), replace the policies below with the
-- commented-out multi-user variant at the bottom of this section.
alter table public.script_events  enable row level security;
alter table public.script_patterns enable row level security;
alter table public.script_quality  enable row level security;

drop policy if exists "own_events_rw"   on public.script_events;
drop policy if exists "own_patterns_rw" on public.script_patterns;
drop policy if exists "own_quality_r"   on public.script_quality;

create policy "own_events_rw" on public.script_events
  for all using (account_id = auth.uid()::uuid)
  with check       (account_id = auth.uid()::uuid);

create policy "own_patterns_rw" on public.script_patterns
  for all using (account_id = auth.uid()::uuid)
  with check       (account_id = auth.uid()::uuid);

create policy "own_quality_r" on public.script_quality
  for select using (
    script_id in (
      select script_id from public.script_patterns
      where account_id = auth.uid()::uuid
    )
  );

-- ---- MULTI-USER WORKSPACE VARIANT (uncomment + drop the above if needed) ----
-- create policy "own_events_rw" on public.script_events
--   for all using (account_id in (
--     select account_id from public.account_members where user_id = auth.uid()
--   ));
-- create policy "own_patterns_rw" on public.script_patterns
--   for all using (account_id in (
--     select account_id from public.account_members where user_id = auth.uid()
--   ));
-- create policy "own_quality_r" on public.script_quality
--   for select using (
--     script_id in (select script_id from public.script_patterns
--       where account_id in (select account_id from public.account_members where user_id = auth.uid())));

-- Service role bypasses RLS — the generation endpoint runs as service role
-- to read the cross-account pattern_pool view. That's the whole point.

comment on view  public.pattern_pool       is 'Anonymous cross-account pattern performance. Generation endpoint reads this with service role. Do NOT expose to client-side queries.';
comment on table public.script_events      is 'Append-only event log. Source of truth for quality_score computation.';
comment on table public.script_patterns    is 'Abstract features extracted from each script at generation time. Used for cross-account learning.';
comment on table public.script_quality     is 'Materialized per-script quality. Auto-recomputed on each event via trigger.';
