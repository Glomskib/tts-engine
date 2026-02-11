-- Migration 105: Analytics Screenshots, Video Files, Product Demographics
-- Supports Task 77 (Screenshot Reader), Task 78 (Video Upload), Task 79 (Demographics)

-- ============================================================================
-- TASK 77: Analytics Screenshots
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,

  -- Extracted data
  extracted_data JSONB NOT NULL DEFAULT '{}',
  views BIGINT,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  engagement_rate NUMERIC(5,2),

  -- Demographics extracted
  gender_breakdown JSONB, -- { male: 45, female: 55 }
  age_breakdown JSONB,    -- { "18-24": 30, "25-34": 40, ... }
  locations JSONB,        -- { "US": 60, "UK": 15, ... }
  follower_ratio NUMERIC(5,2), -- % non-followers

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'confirmed', 'error')),
  error_message TEXT,

  -- File info
  file_url TEXT,
  file_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screenshots_user ON analytics_screenshots(user_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_video ON analytics_screenshots(video_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_product ON analytics_screenshots(product_id);

ALTER TABLE analytics_screenshots ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TASK 78: Video file storage columns
-- ============================================================================

ALTER TABLE videos ADD COLUMN IF NOT EXISTS raw_video_url TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS edited_video_url TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS file_size_mb NUMERIC(8,2);

-- ============================================================================
-- TASK 79: Product demographic columns
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_gender TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_age_range TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_location TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS demographic_data JSONB DEFAULT '{}';

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON TABLE analytics_screenshots IS 'TikTok analytics screenshots uploaded and processed by AI vision';
COMMENT ON COLUMN videos.raw_video_url IS 'URL to raw footage uploaded by creator';
COMMENT ON COLUMN videos.edited_video_url IS 'URL to edited video uploaded by VA';
COMMENT ON COLUMN products.demographic_data IS 'Aggregated demographic data from analytics screenshots';
