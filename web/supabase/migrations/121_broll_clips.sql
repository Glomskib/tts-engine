-- B-roll clips: short video clips of product in various scenes.
-- Reusable per product — once generated, any future video for the same product
-- can use these clips in the Shotstack compose layer.
-- Source priority: library (free) > upload (free) > runway (paid AI credits)

CREATE TABLE IF NOT EXISTS broll_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  scene_number INT NOT NULL,
  prompt TEXT NOT NULL,
  render_task_id TEXT,
  clip_url TEXT,
  duration_seconds FLOAT DEFAULT 5,
  render_provider TEXT DEFAULT 'runway',
  source TEXT DEFAULT 'runway' CHECK (source IN ('runway', 'library', 'upload')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'rendering', 'done', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_broll_clips_product ON broll_clips(product_id);
CREATE INDEX idx_broll_clips_product_done ON broll_clips(product_id) WHERE status = 'done';
