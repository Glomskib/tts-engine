-- FlashFlow Self-Improvement Loop
-- Tables: ff_generations, ff_outcomes, ff_events
-- Tracks every generation, its real-world outcome, and lifecycle events.

-- =============================================
-- 1. ff_generations — one row per AI generation
-- =============================================
CREATE TABLE IF NOT EXISTS ff_generations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id   text,                       -- e.g. 'hook_v3', 'script_sober_curious'
  prompt_version text,                      -- semver or label for the prompt used
  inputs_json   jsonb NOT NULL DEFAULT '{}', -- raw inputs sent to the model
  output_text   text,                       -- generated content (hook / script / etc.)
  output_json   jsonb,                      -- structured output if applicable
  model         text,                       -- 'gpt-4o-mini', 'claude-3-5-sonnet', etc.
  latency_ms    integer,                    -- generation wall-clock time
  token_count   integer,                    -- total tokens used
  status        text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','rejected')),
  correlation_id text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ff_generations_user_id ON ff_generations(user_id);
CREATE INDEX idx_ff_generations_template ON ff_generations(template_id);
CREATE INDEX idx_ff_generations_created ON ff_generations(created_at DESC);
CREATE INDEX idx_ff_generations_status ON ff_generations(status);

-- =============================================
-- 2. ff_outcomes — one row per generation outcome
-- =============================================
CREATE TABLE IF NOT EXISTS ff_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id   uuid NOT NULL UNIQUE REFERENCES ff_generations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating          smallint CHECK (rating >= 1 AND rating <= 5),
  is_winner       boolean NOT NULL DEFAULT false,
  is_rejected     boolean NOT NULL DEFAULT false,
  is_regenerated  boolean NOT NULL DEFAULT false,
  views           integer DEFAULT 0,
  orders          integer DEFAULT 0,
  revenue_cents   integer DEFAULT 0,
  winner_score    numeric(6,2),              -- composite score for ranking
  feedback_text   text,                      -- optional free-text feedback
  tags            text[] DEFAULT '{}',       -- e.g. {'too-salesy','good-hook'}
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ff_outcomes_generation ON ff_outcomes(generation_id);
CREATE INDEX idx_ff_outcomes_user_id ON ff_outcomes(user_id);
CREATE INDEX idx_ff_outcomes_winner ON ff_outcomes(is_winner) WHERE is_winner = true;
CREATE INDEX idx_ff_outcomes_created ON ff_outcomes(created_at DESC);

-- =============================================
-- 3. ff_events — lifecycle events for a generation
-- =============================================
CREATE TABLE IF NOT EXISTS ff_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id   uuid NOT NULL REFERENCES ff_generations(id) ON DELETE CASCADE,
  event_type      text NOT NULL,             -- 'viewed','edited','approved','rejected','regenerated','posted','feedback'
  actor           text,                      -- user email or system
  payload         jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ff_events_generation ON ff_events(generation_id);
CREATE INDEX idx_ff_events_type ON ff_events(event_type);
CREATE INDEX idx_ff_events_created ON ff_events(created_at DESC);

-- =============================================
-- 4. RLS policies
-- =============================================

ALTER TABLE ff_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_events ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by API routes via supabaseAdmin)
-- No explicit policy needed; service role bypasses RLS.

-- Authenticated users can read their own rows
CREATE POLICY "ff_generations_select_own" ON ff_generations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ff_outcomes_select_own" ON ff_outcomes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ff_events_select_own" ON ff_events
  FOR SELECT TO authenticated
  USING (
    generation_id IN (
      SELECT id FROM ff_generations WHERE user_id = auth.uid()
    )
  );

-- No direct insert/update/delete for authenticated users;
-- all writes go through service role in API routes.

-- =============================================
-- 5. updated_at trigger
-- =============================================
CREATE OR REPLACE FUNCTION ff_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ff_generations_updated
  BEFORE UPDATE ON ff_generations
  FOR EACH ROW EXECUTE FUNCTION ff_set_updated_at();

CREATE TRIGGER trg_ff_outcomes_updated
  BEFORE UPDATE ON ff_outcomes
  FOR EACH ROW EXECUTE FUNCTION ff_set_updated_at();
