-- Migration 085: Clawbot Weekly Summaries
-- Stores computed pattern summaries for learning loop

CREATE TABLE IF NOT EXISTS clawbot_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary_type TEXT NOT NULL CHECK (summary_type IN ('weekly','monthly')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, summary_type, period_start, period_end)
);

ALTER TABLE clawbot_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their summaries" ON clawbot_summaries;

CREATE POLICY "Users own their summaries"
ON clawbot_summaries
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_clawbot_summaries_user ON clawbot_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_clawbot_summaries_type ON clawbot_summaries(summary_type, created_at DESC);
