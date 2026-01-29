-- Link saved_skits to videos for workflow integration
-- When a skit is "sent to video queue", track the linked video

ALTER TABLE saved_skits
ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES videos(id) ON DELETE SET NULL;

-- Index for finding skits linked to a video
CREATE INDEX IF NOT EXISTS idx_saved_skits_video_id ON saved_skits(video_id);

-- Comment
COMMENT ON COLUMN saved_skits.video_id IS 'Links skit to a video when sent to video queue';
