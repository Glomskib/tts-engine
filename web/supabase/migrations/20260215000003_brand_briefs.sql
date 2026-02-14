-- Brand Briefs: AI-analyzed creator briefs from brands
CREATE TABLE IF NOT EXISTS public.brand_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,

  title TEXT NOT NULL DEFAULT 'Untitled Brief',
  raw_text TEXT NOT NULL,
  brief_type TEXT NOT NULL DEFAULT 'contest'
    CHECK (brief_type IN ('retainer', 'contest', 'campaign', 'launch', 'general')),
  source_url TEXT,

  -- AI extraction results
  ai_analysis JSONB DEFAULT '{}',
  campaign_start DATE,
  campaign_end DATE,
  focus_product TEXT,
  focus_product_url TEXT,
  min_videos INTEGER,
  registration_url TEXT,
  required_hashtags TEXT[] DEFAULT '{}',

  -- Bonus structures
  posting_bonuses JSONB DEFAULT '[]',
  gmv_bonuses JSONB DEFAULT '[]',
  live_bonuses JSONB DEFAULT '[]',
  base_commission_pct NUMERIC(5,2),

  -- AI-generated plans
  posting_schedule JSONB DEFAULT '[]',
  script_starters JSONB DEFAULT '[]',
  income_projections JSONB DEFAULT '{}',
  strategic_notes JSONB DEFAULT '[]',

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'ready', 'applied', 'archived', 'failed')),
  applied_to_brand BOOLEAN DEFAULT false,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_briefs_user ON brand_briefs(user_id);
CREATE INDEX IF NOT EXISTS idx_brand_briefs_status ON brand_briefs(status);

ALTER TABLE brand_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own briefs" ON brand_briefs
  FOR ALL USING (auth.uid() = user_id);
