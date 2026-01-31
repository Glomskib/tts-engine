-- 055_persona_refactor.sql
-- Refactor personas to be product-independent with rich psychographic data

-- ============================================
-- ADD NEW COLUMNS TO audience_personas
-- ============================================

-- Demographics (new fields)
ALTER TABLE public.audience_personas
ADD COLUMN IF NOT EXISTS income_level TEXT,  -- "budget-conscious", "middle-income", "affluent"
ADD COLUMN IF NOT EXISTS location_type TEXT,  -- "urban", "suburban", "rural"
ADD COLUMN IF NOT EXISTS life_stage TEXT;  -- "single", "new parent", "empty nester", "retired"

-- Psychographics (new fields)
ALTER TABLE public.audience_personas
ADD COLUMN IF NOT EXISTS values TEXT[] DEFAULT '{}',  -- ["health", "family", "convenience", "value", "quality", "sustainability"]
ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}',  -- ["fitness", "cooking", "technology", "travel"]
ADD COLUMN IF NOT EXISTS personality_traits TEXT[] DEFAULT '{}';  -- ["skeptical", "impulsive", "research-driven", "trend-follower"]

-- Communication Style (new fields)
ALTER TABLE public.audience_personas
ADD COLUMN IF NOT EXISTS tone_preference TEXT,  -- "casual", "professional", "humorous", "emotional"
ADD COLUMN IF NOT EXISTS attention_span TEXT,  -- "quick hooks needed", "will watch longer content", "skims"
ADD COLUMN IF NOT EXISTS trust_builders TEXT[] DEFAULT '{}';  -- ["testimonials", "data/stats", "expert endorsements", "relatable stories"]

-- Pain Points & Motivations (restructure existing, add new)
ALTER TABLE public.audience_personas
ADD COLUMN IF NOT EXISTS primary_pain_points TEXT[] DEFAULT '{}',  -- Simple array of pain point strings
ADD COLUMN IF NOT EXISTS emotional_triggers TEXT[] DEFAULT '{}',  -- ["fear of missing out", "desire for simplicity", "wanting to belong"]
ADD COLUMN IF NOT EXISTS buying_objections TEXT[] DEFAULT '{}',  -- ["price concerns", "skeptical of claims", "needs social proof"]
ADD COLUMN IF NOT EXISTS purchase_motivators TEXT[] DEFAULT '{}';  -- ["discounts", "urgency", "social proof", "quality"]

-- Content Preferences (new fields)
ALTER TABLE public.audience_personas
ADD COLUMN IF NOT EXISTS content_types_preferred TEXT[] DEFAULT '{}',  -- renamed from content_they_engage_with for clarity
ADD COLUMN IF NOT EXISTS best_posting_times TEXT;  -- optional text description

-- Avatar/visual (optional)
ALTER TABLE public.audience_personas
ADD COLUMN IF NOT EXISTS avatar_type TEXT;  -- for UI display

-- ============================================
-- MIGRATE EXISTING DATA
-- ============================================

-- Copy existing pain_points JSONB to primary_pain_points array (extract just the text)
UPDATE public.audience_personas
SET primary_pain_points = (
  SELECT COALESCE(
    array_agg(elem->>'point'),
    '{}'::text[]
  )
  FROM jsonb_array_elements(COALESCE(pain_points, '[]'::jsonb)) AS elem
  WHERE elem->>'point' IS NOT NULL AND elem->>'point' != ''
)
WHERE pain_points IS NOT NULL AND jsonb_array_length(pain_points) > 0;

-- Copy common_objections to buying_objections if not already set
UPDATE public.audience_personas
SET buying_objections = common_objections
WHERE common_objections IS NOT NULL
  AND array_length(common_objections, 1) > 0
  AND (buying_objections IS NULL OR array_length(buying_objections, 1) = 0);

-- Copy content_they_engage_with to content_types_preferred
UPDATE public.audience_personas
SET content_types_preferred = content_they_engage_with
WHERE content_they_engage_with IS NOT NULL
  AND array_length(content_they_engage_with, 1) > 0
  AND (content_types_preferred IS NULL OR array_length(content_types_preferred, 1) = 0);

-- Copy tone to tone_preference if not already set
UPDATE public.audience_personas
SET tone_preference = tone
WHERE tone IS NOT NULL
  AND tone != ''
  AND (tone_preference IS NULL OR tone_preference = '');

-- ============================================
-- DEPRECATE OLD PRODUCT-LINKED COLUMNS
-- (Don't delete - just add comments for deprecation)
-- ============================================

COMMENT ON COLUMN public.audience_personas.product_categories IS 'DEPRECATED: Personas should not be tied to products. Will be removed in future migration.';
COMMENT ON COLUMN public.audience_personas.product_ids IS 'DEPRECATED: Personas should not be tied to products. Will be removed in future migration.';

-- Also mark old pain_points JSONB as deprecated in favor of primary_pain_points
COMMENT ON COLUMN public.audience_personas.pain_points IS 'DEPRECATED: Use primary_pain_points array instead. Will be removed in future migration.';

-- ============================================
-- ADD INDEXES FOR NEW FIELDS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_audience_personas_life_stage ON public.audience_personas(life_stage);
CREATE INDEX IF NOT EXISTS idx_audience_personas_income ON public.audience_personas(income_level);
CREATE INDEX IF NOT EXISTS idx_audience_personas_values ON public.audience_personas USING gin(values);
CREATE INDEX IF NOT EXISTS idx_audience_personas_interests ON public.audience_personas USING gin(interests);

-- ============================================
-- UPDATE COMMENTS
-- ============================================

COMMENT ON TABLE public.audience_personas IS 'Product-independent audience personas with rich psychographic data for targeted content creation';

COMMENT ON COLUMN public.audience_personas.income_level IS 'Economic bracket: budget-conscious, middle-income, affluent';
COMMENT ON COLUMN public.audience_personas.location_type IS 'Living environment: urban, suburban, rural';
COMMENT ON COLUMN public.audience_personas.life_stage IS 'Life phase: single, new parent, empty nester, retired';
COMMENT ON COLUMN public.audience_personas.values IS 'Core values: health, family, convenience, value, quality, sustainability';
COMMENT ON COLUMN public.audience_personas.interests IS 'Interests and hobbies array';
COMMENT ON COLUMN public.audience_personas.personality_traits IS 'Behavioral traits: skeptical, impulsive, research-driven, trend-follower';
COMMENT ON COLUMN public.audience_personas.tone_preference IS 'Preferred communication tone: casual, professional, humorous, emotional';
COMMENT ON COLUMN public.audience_personas.attention_span IS 'Content consumption style: quick hooks needed, will watch longer content, skims';
COMMENT ON COLUMN public.audience_personas.trust_builders IS 'What builds trust: testimonials, data/stats, expert endorsements, relatable stories';
COMMENT ON COLUMN public.audience_personas.primary_pain_points IS 'Array of pain point strings (replaces JSONB pain_points)';
COMMENT ON COLUMN public.audience_personas.emotional_triggers IS 'What emotionally motivates them: FOMO, desire for simplicity, wanting to belong';
COMMENT ON COLUMN public.audience_personas.buying_objections IS 'What holds them back from buying';
COMMENT ON COLUMN public.audience_personas.purchase_motivators IS 'What pushes them to buy: discounts, urgency, social proof, quality';
COMMENT ON COLUMN public.audience_personas.content_types_preferred IS 'Content formats they engage with';
COMMENT ON COLUMN public.audience_personas.best_posting_times IS 'Optimal posting times for this audience';
COMMENT ON COLUMN public.audience_personas.avatar_type IS 'Visual representation type for UI';
