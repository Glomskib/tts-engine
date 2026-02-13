-- Migration 116: Performance indexes for common query patterns
-- DO NOT APPLY AUTOMATICALLY — review before running.

-- Videos table: most common query patterns
CREATE INDEX IF NOT EXISTS idx_videos_recording_status ON videos(recording_status);
CREATE INDEX IF NOT EXISTS idx_videos_product_id ON videos(product_id);
CREATE INDEX IF NOT EXISTS idx_videos_account_id ON videos(account_id);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_render_task_id ON videos(render_task_id) WHERE render_task_id IS NOT NULL;

-- Saved skits: lookup by product
CREATE INDEX IF NOT EXISTS idx_saved_skits_product_id ON saved_skits(product_id);
CREATE INDEX IF NOT EXISTS idx_saved_skits_account_id ON saved_skits(account_id);

-- Agent tasks: status queries
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created_at ON agent_tasks(created_at DESC);
