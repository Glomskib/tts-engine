-- Creator Style Fingerprinting System
-- Study external TikTok/YouTube creators and extract style patterns

-- ============================================================================
-- Table: style_creators — tracked external creators
-- ============================================================================

CREATE TABLE IF NOT EXISTS style_creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  handle VARCHAR(100) NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('tiktok', 'youtube')),
  display_name VARCHAR(255),
  niche VARCHAR(100),
  notes TEXT,
  style_fingerprint JSONB,
  fingerprint_version INT NOT NULL DEFAULT 0,
  videos_analyzed INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, handle, platform)
);

-- ============================================================================
-- Table: style_creator_videos — individual analyzed videos
-- ============================================================================

CREATE TABLE IF NOT EXISTS style_creator_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES style_creators(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('tiktok', 'youtube')),
  title VARCHAR(500),
  transcript_text TEXT,
  transcript_segments JSONB,
  transcript_language VARCHAR(10),
  duration_seconds NUMERIC(6,1),
  frame_count INT,
  visual_observation JSONB,
  style_analysis JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'downloading', 'transcribing', 'extracting_frames', 'analyzing', 'completed', 'failed')),
  error_message TEXT,
  processing_time_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzed_at TIMESTAMPTZ,
  UNIQUE(creator_id, url)
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX idx_style_creators_user_id ON style_creators(user_id);
CREATE INDEX idx_style_creator_videos_creator_id ON style_creator_videos(creator_id);
CREATE INDEX idx_style_creator_videos_user_id ON style_creator_videos(user_id);
CREATE INDEX idx_style_creator_videos_status ON style_creator_videos(status);

-- ============================================================================
-- Trigger: auto-update videos_analyzed count on completion
-- ============================================================================

CREATE OR REPLACE FUNCTION update_style_creator_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    UPDATE style_creators
    SET
      videos_analyzed = (
        SELECT COUNT(*) FROM style_creator_videos
        WHERE creator_id = NEW.creator_id AND status = 'completed'
      ),
      updated_at = now()
    WHERE id = NEW.creator_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_style_creator_video_completed
  AFTER INSERT OR UPDATE OF status ON style_creator_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_style_creator_stats();

-- ============================================================================
-- RLS: Users see only their own rows
-- ============================================================================

ALTER TABLE style_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_creator_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY style_creators_user_policy ON style_creators
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY style_creator_videos_user_policy ON style_creator_videos
  FOR ALL USING (auth.uid() = user_id);
