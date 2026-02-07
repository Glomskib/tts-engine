-- Migration 086: Clawbot Monthly Summaries
-- No schema change required; summary_type already supports 'monthly'
-- Add composite index for faster lookups

CREATE INDEX IF NOT EXISTS idx_clawbot_summaries_user_type_period
ON clawbot_summaries (user_id, summary_type, period_end DESC);
