-- Add script_quality_score JSONB column to saved_skits
-- Stores AI-generated quality scores from the script scorer:
-- { totalScore, scores: {hook_strength, authenticity, persona_match, emotional_trigger, call_to_action}, feedback, suggestedImprovements, passed, model, scored_at }

ALTER TABLE saved_skits
  ADD COLUMN IF NOT EXISTS script_quality_score JSONB;

COMMENT ON COLUMN saved_skits.script_quality_score IS 'AI script quality score from lib/script-scorer.ts — pass threshold 7/10';
