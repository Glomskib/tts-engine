-- Winners integration for saved_skits
-- Add fields to track winning skits and their performance metrics

ALTER TABLE saved_skits
ADD COLUMN IF NOT EXISTS is_winner BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS performance_metrics JSONB,
ADD COLUMN IF NOT EXISTS posted_video_url TEXT,
ADD COLUMN IF NOT EXISTS marked_winner_at TIMESTAMPTZ;

-- Index for querying winners
CREATE INDEX IF NOT EXISTS idx_saved_skits_is_winner ON saved_skits(is_winner) WHERE is_winner = TRUE;

-- Comment
COMMENT ON COLUMN saved_skits.is_winner IS 'Whether this skit has been marked as a top performer';
COMMENT ON COLUMN saved_skits.performance_metrics IS 'Performance data: {view_count, engagement_rate, likes, comments, shares}';
COMMENT ON COLUMN saved_skits.posted_video_url IS 'URL to the posted video (TikTok, etc.)';
COMMENT ON COLUMN saved_skits.marked_winner_at IS 'When the skit was marked as a winner';
