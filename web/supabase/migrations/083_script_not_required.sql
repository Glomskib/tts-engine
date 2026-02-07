-- Add script_not_required flag to videos table
-- Used for BOF / already-filmed videos that skip the script stage
ALTER TABLE videos ADD COLUMN IF NOT EXISTS script_not_required BOOLEAN DEFAULT FALSE;
