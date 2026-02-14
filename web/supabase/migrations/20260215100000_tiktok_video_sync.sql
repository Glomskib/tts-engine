-- ============================================
-- TikTok Video Sync + Creator DNA Foundation
-- ============================================

-- 1. Synced TikTok videos (the creator's FULL catalog)
CREATE TABLE IF NOT EXISTS public.tiktok_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.tiktok_accounts(id) ON DELETE SET NULL,

  -- TikTok native data
  tiktok_video_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  create_time BIGINT,
  cover_image_url TEXT,
  share_url TEXT,
  duration INTEGER,

  -- Performance metrics (updated each sync)
  view_count BIGINT DEFAULT 0,
  like_count BIGINT DEFAULT 0,
  comment_count BIGINT DEFAULT 0,
  share_count BIGINT DEFAULT 0,

  -- FlashFlow matching
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'tiktok_sync' CHECK (source IN ('flashflow', 'tiktok_sync', 'manual')),

  -- AI analysis (populated by analysis queue)
  transcript_text TEXT,
  ai_analysis JSONB,
  content_grade TEXT CHECK (content_grade IN ('A', 'B', 'C', 'D', 'F', NULL)),
  content_tags TEXT[] DEFAULT '{}',

  -- Auto-classification
  matched_brand TEXT,
  matched_product TEXT,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,

  -- Sales attribution (populated by sales sync)
  attributed_orders INTEGER DEFAULT 0,
  attributed_gmv NUMERIC(12,2) DEFAULT 0,

  -- Sync metadata
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, tiktok_video_id)
);

CREATE INDEX idx_tiktok_videos_user ON tiktok_videos(user_id);
CREATE INDEX idx_tiktok_videos_account ON tiktok_videos(account_id);
CREATE INDEX idx_tiktok_videos_brand ON tiktok_videos(matched_brand);
CREATE INDEX idx_tiktok_videos_grade ON tiktok_videos(user_id, content_grade);
CREATE INDEX idx_tiktok_videos_create_time ON tiktok_videos(user_id, create_time DESC);
CREATE INDEX idx_tiktok_videos_transcript ON tiktok_videos USING gin(to_tsvector('english', COALESCE(transcript_text, '')));

ALTER TABLE tiktok_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own synced videos" ON tiktok_videos FOR ALL USING (auth.uid() = user_id);


-- 2. Analysis queue (videos waiting for Whisper + Claude analysis)
CREATE TABLE IF NOT EXISTS public.analysis_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tiktok_video_id UUID NOT NULL REFERENCES public.tiktok_videos(id) ON DELETE CASCADE,

  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),

  attempts INTEGER DEFAULT 0,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  UNIQUE(tiktok_video_id)
);

CREATE INDEX idx_analysis_queue_pending ON analysis_queue(status, priority DESC, created_at ASC) WHERE status = 'pending';

ALTER TABLE analysis_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own queue" ON analysis_queue FOR ALL USING (auth.uid() = user_id);


-- 3. Creator DNA (aggregate intelligence from all analyzed videos)
CREATE TABLE IF NOT EXISTS public.creator_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  total_videos_analyzed INTEGER DEFAULT 0,
  last_analyzed_at TIMESTAMPTZ,

  -- Aggregated patterns
  hook_patterns JSONB DEFAULT '{}',
  format_patterns JSONB DEFAULT '{}',
  language_patterns JSONB DEFAULT '{}',
  emotional_patterns JSONB DEFAULT '{}',
  performance_patterns JSONB DEFAULT '{}',
  niche_patterns JSONB DEFAULT '{}',
  evolution JSONB DEFAULT '{}',

  -- Human-readable summaries
  winning_formula TEXT,
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  growth_recommendations JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE creator_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own DNA" ON creator_dna FOR ALL USING (auth.uid() = user_id);


-- 4. Sales summary (aggregated GMV data for fast lookups)
CREATE TABLE IF NOT EXISTS public.sales_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,

  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  total_orders INTEGER DEFAULT 0,
  total_gmv NUMERIC(12,2) DEFAULT 0,
  total_commission NUMERIC(12,2) DEFAULT 0,
  total_videos INTEGER DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  avg_engagement NUMERIC(5,2) DEFAULT 0,

  performance_by_type JSONB DEFAULT '{}',
  computed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, brand_id, product_id, period_type, period_start)
);

CREATE INDEX idx_sales_summary_user ON sales_summary(user_id, period_type, period_start DESC);

ALTER TABLE sales_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own sales" ON sales_summary FOR ALL USING (auth.uid() = user_id);


-- 5. Add video.list scope tracking to tiktok accounts
ALTER TABLE public.tiktok_accounts
  ADD COLUMN IF NOT EXISTS has_video_list_scope BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_video_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_synced_videos INTEGER DEFAULT 0;

COMMENT ON TABLE tiktok_videos IS 'Full TikTok video catalog synced via video.list API scope';
COMMENT ON TABLE analysis_queue IS 'Queue for background Whisper transcription + Claude analysis of synced videos';
COMMENT ON TABLE creator_dna IS 'Aggregate intelligence profile built from all analyzed videos';
COMMENT ON TABLE sales_summary IS 'Aggregated GMV/commission data per brand/product/period';
