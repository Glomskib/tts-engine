-- Add intent column to support_threads for LLM intent classification
ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS intent text;
CREATE INDEX IF NOT EXISTS idx_support_threads_intent ON support_threads(intent);
