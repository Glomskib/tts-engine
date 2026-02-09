-- Migration 090: TikTok Stats + Auto-Winner Detection
-- Adds TikTok-specific stat columns, winner detection columns, and performance view

-- TikTok stats columns (separate from existing aggregate columns for source clarity)
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
ADD COLUMN IF NOT EXISTS tiktok_views INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiktok_likes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiktok_comments INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiktok_shares INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiktok_saves INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiktok_sales INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiktok_revenue DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiktok_clicks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS stats_updated_at TIMESTAMPTZ;

-- Winner detection columns
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS is_winner BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS winner_detected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS winner_confidence TEXT,
ADD COLUMN IF NOT EXISTS winner_score INTEGER,
ADD COLUMN IF NOT EXISTS winner_reasons TEXT[];

-- Indexes
CREATE INDEX IF NOT EXISTS idx_videos_tiktok_url ON public.videos(tiktok_url);
CREATE INDEX IF NOT EXISTS idx_videos_is_winner ON public.videos(is_winner) WHERE is_winner = TRUE;
CREATE INDEX IF NOT EXISTS idx_videos_winner_score ON public.videos(winner_score DESC NULLS LAST);

-- Backfill: copy posted_url to tiktok_url for TikTok videos that already have a posted URL
UPDATE public.videos
SET tiktok_url = posted_url
WHERE posted_url IS NOT NULL
  AND posted_platform = 'tiktok'
  AND tiktok_url IS NULL;

-- Performance view with engagement and conversion rates
CREATE OR REPLACE VIEW video_performance AS
SELECT
  v.id,
  v.video_code,
  v.title,
  v.product_id,
  p.name AS product_name,
  p.brand AS product_brand,
  v.recording_status,
  v.posted_url,
  v.posted_platform,
  v.tiktok_url,
  v.tiktok_views,
  v.tiktok_likes,
  v.tiktok_comments,
  v.tiktok_shares,
  v.tiktok_saves,
  v.tiktok_sales,
  v.tiktok_revenue,
  v.tiktok_clicks,
  v.stats_updated_at,
  v.is_winner,
  v.winner_detected_at,
  v.winner_confidence,
  v.winner_score,
  v.winner_reasons,
  v.created_at,
  CASE
    WHEN v.tiktok_views > 0
    THEN ROUND(((v.tiktok_likes + v.tiktok_comments + v.tiktok_shares)::numeric / v.tiktok_views) * 100, 2)
    ELSE 0
  END AS engagement_rate,
  CASE
    WHEN v.tiktok_clicks > 0 AND v.tiktok_sales > 0
    THEN ROUND((v.tiktok_sales::numeric / v.tiktok_clicks) * 100, 2)
    ELSE 0
  END AS conversion_rate
FROM videos v
LEFT JOIN products p ON v.product_id = p.id;
