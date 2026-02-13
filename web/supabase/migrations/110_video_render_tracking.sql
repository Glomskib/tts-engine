-- 110: Add render tracking columns to videos table
-- Stores Runway (or other provider) render task IDs for automated video generation

ALTER TABLE videos ADD COLUMN IF NOT EXISTS render_task_id TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS render_provider TEXT;

COMMENT ON COLUMN videos.render_task_id IS 'External render task ID (e.g. Runway task ID)';
COMMENT ON COLUMN videos.render_provider IS 'Render provider name (e.g. runway)';
