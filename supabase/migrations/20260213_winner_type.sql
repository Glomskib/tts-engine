-- Add winner_type column to distinguish hooks from full scripts
ALTER TABLE public.winners_bank
ADD COLUMN IF NOT EXISTS winner_type VARCHAR(20) DEFAULT 'script'
CHECK (winner_type IN ('script', 'hook'));

CREATE INDEX IF NOT EXISTS idx_winners_bank_type ON public.winners_bank(user_id, winner_type);
