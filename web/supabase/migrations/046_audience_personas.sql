-- Migration 046: Audience Intelligence System
-- Purpose: Store audience personas and pain points for authentic content creation

-- ============================================
-- AUDIENCE PERSONAS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.audience_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name TEXT NOT NULL,  -- "Stressed Mom", "Health-Conscious Millennial", "Skeptical Buyer"
  description TEXT,

  -- Demographics
  age_range TEXT,  -- "25-34", "35-44"
  gender TEXT,
  lifestyle TEXT,  -- "busy professional", "stay-at-home parent", "fitness enthusiast"

  -- Pain points (array of objects)
  pain_points JSONB DEFAULT '[]'::jsonb,  -- [{point: "no time for self-care", intensity: "high", triggers: ["morning rush"]}]

  -- Language patterns
  phrases_they_use TEXT[] DEFAULT '{}',  -- ["I'm so tired", "there's never enough time"]
  phrases_to_avoid TEXT[] DEFAULT '{}',  -- ["synergy", "optimize", "leverage"]
  tone TEXT,  -- "casual", "skeptical", "enthusiastic"
  humor_style TEXT,  -- "self-deprecating", "sarcastic", "wholesome"

  -- Objections & beliefs
  common_objections TEXT[] DEFAULT '{}',  -- ["it's too expensive", "I've been burned before"]
  beliefs JSONB DEFAULT '{}'::jsonb,  -- {about_health: "natural is better", about_money: "value over price"}

  -- Content preferences
  content_they_engage_with TEXT[] DEFAULT '{}',  -- ["relatable fails", "before/after", "day in the life"]
  platforms TEXT[] DEFAULT '{}',  -- ["tiktok", "instagram"]

  -- Product associations
  product_categories TEXT[] DEFAULT '{}',  -- ["supplements", "wellness", "beauty"]
  product_ids UUID[] DEFAULT '{}',  -- Direct product links

  -- Usage stats
  times_used INT DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audience_personas_name ON public.audience_personas(name);
CREATE INDEX IF NOT EXISTS idx_audience_personas_categories ON public.audience_personas USING gin(product_categories);
CREATE INDEX IF NOT EXISTS idx_audience_personas_created ON public.audience_personas(created_at DESC);

-- RLS
ALTER TABLE public.audience_personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage personas" ON public.audience_personas FOR ALL USING (auth.uid() IS NOT NULL);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_audience_personas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audience_personas_updated_at ON public.audience_personas;
CREATE TRIGGER trigger_audience_personas_updated_at
  BEFORE UPDATE ON public.audience_personas
  FOR EACH ROW
  EXECUTE FUNCTION update_audience_personas_updated_at();

-- ============================================
-- PAIN POINTS LIBRARY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.pain_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The pain point
  pain_point TEXT NOT NULL,  -- "Can't sleep through the night"
  category TEXT,  -- "sleep", "energy", "stress", "weight", "skin", "digestion"

  -- Context
  when_it_happens TEXT,  -- "3am, mind racing about tomorrow"
  emotional_state TEXT,  -- "frustrated", "desperate", "hopeless"
  intensity TEXT DEFAULT 'medium',  -- "low", "medium", "high", "extreme"

  -- Language
  how_they_describe_it TEXT[] DEFAULT '{}',  -- ["I'm exhausted but wired", "my brain won't shut off"]
  related_searches TEXT[] DEFAULT '{}',  -- ["natural sleep aids", "how to fall asleep fast"]

  -- Solution framing
  what_they_want TEXT,  -- "Fall asleep naturally without grogginess"
  objections_to_solutions TEXT[] DEFAULT '{}',  -- ["melatonin gives me weird dreams"]

  -- Products that solve this
  product_ids UUID[] DEFAULT '{}',

  -- Usage stats
  times_used INT DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pain_points_category ON public.pain_points(category);
CREATE INDEX IF NOT EXISTS idx_pain_points_products ON public.pain_points USING gin(product_ids);
CREATE INDEX IF NOT EXISTS idx_pain_points_text ON public.pain_points USING gin(to_tsvector('english', pain_point));

-- RLS
ALTER TABLE public.pain_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage pain points" ON public.pain_points FOR ALL USING (auth.uid() IS NOT NULL);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_pain_points_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pain_points_updated_at ON public.pain_points;
CREATE TRIGGER trigger_pain_points_updated_at
  BEFORE UPDATE ON public.pain_points
  FOR EACH ROW
  EXECUTE FUNCTION update_pain_points_updated_at();

-- ============================================
-- LANGUAGE PATTERNS TABLE (for tracking what works)
-- ============================================

CREATE TABLE IF NOT EXISTS public.language_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  pattern_type TEXT NOT NULL,  -- "phrase", "hook_opener", "cta", "objection_handler"
  pattern_text TEXT NOT NULL,

  -- Context
  persona_id UUID REFERENCES public.audience_personas(id) ON DELETE SET NULL,
  category TEXT,  -- category it works well for

  -- Performance
  times_used INT DEFAULT 0,
  success_rate NUMERIC(5,2),  -- based on video performance
  source TEXT,  -- "winner_analysis", "manual", "ai_suggested"
  source_video_id UUID,  -- reference to winning video if extracted from one

  -- Flags
  is_recommended BOOLEAN DEFAULT TRUE,
  is_avoid BOOLEAN DEFAULT FALSE,  -- phrases to avoid

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_language_patterns_type ON public.language_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_language_patterns_persona ON public.language_patterns(persona_id);

ALTER TABLE public.language_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage language patterns" ON public.language_patterns FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.audience_personas IS 'Audience personas for targeted, authentic content creation';
COMMENT ON TABLE public.pain_points IS 'Library of customer pain points with language patterns';
COMMENT ON TABLE public.language_patterns IS 'Tracked language patterns that work (or dont) for content';

COMMENT ON COLUMN public.audience_personas.pain_points IS 'JSON array: [{point, intensity, triggers}]';
COMMENT ON COLUMN public.audience_personas.beliefs IS 'JSON object: {about_health, about_money, about_self}';
COMMENT ON COLUMN public.pain_points.how_they_describe_it IS 'Exact phrases customers use to describe this pain';
