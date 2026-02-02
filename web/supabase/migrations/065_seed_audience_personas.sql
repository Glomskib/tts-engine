-- ============================================================================
-- SEED AUDIENCE PERSONAS WITH DEFAULT DATA
-- Ensures the audience_personas table has system personas available
-- ============================================================================

-- First, ensure the table exists (should already exist from migration 046)
CREATE TABLE IF NOT EXISTS public.audience_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  age_range TEXT,
  gender TEXT,
  lifestyle TEXT,
  pain_points JSONB DEFAULT '[]'::jsonb,
  phrases_they_use TEXT[] DEFAULT '{}',
  phrases_to_avoid TEXT[] DEFAULT '{}',
  tone TEXT,
  tone_preference TEXT,
  humor_style TEXT,
  common_objections TEXT[] DEFAULT '{}',
  beliefs JSONB DEFAULT '{}'::jsonb,
  content_they_engage_with TEXT[] DEFAULT '{}',
  platforms TEXT[] DEFAULT '{}',
  product_categories TEXT[] DEFAULT '{}',
  product_ids UUID[] DEFAULT '{}',
  times_used INT DEFAULT 0,
  -- New columns for system personas
  is_system BOOLEAN DEFAULT false,
  avatar_type TEXT,
  full_description TEXT,
  style TEXT,
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add is_system column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audience_personas' AND column_name = 'is_system'
  ) THEN
    ALTER TABLE public.audience_personas ADD COLUMN is_system BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add full_description column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audience_personas' AND column_name = 'full_description'
  ) THEN
    ALTER TABLE public.audience_personas ADD COLUMN full_description TEXT;
  END IF;
END $$;

-- Add style column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audience_personas' AND column_name = 'style'
  ) THEN
    ALTER TABLE public.audience_personas ADD COLUMN style TEXT;
  END IF;
END $$;

-- Add user_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audience_personas' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.audience_personas ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Enable RLS if not already enabled
ALTER TABLE public.audience_personas ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and recreate
DROP POLICY IF EXISTS "Users can manage personas" ON public.audience_personas;
DROP POLICY IF EXISTS "System personas are readable by all" ON public.audience_personas;
DROP POLICY IF EXISTS "Users can read own personas" ON public.audience_personas;
DROP POLICY IF EXISTS "Users can manage own personas" ON public.audience_personas;

-- System personas are readable by all authenticated users
CREATE POLICY "System personas readable by all" ON public.audience_personas
  FOR SELECT USING (is_system = true AND auth.uid() IS NOT NULL);

-- Users can read their own custom personas
CREATE POLICY "Users can read own personas" ON public.audience_personas
  FOR SELECT USING (user_id = auth.uid() OR created_by = auth.uid());

-- Users can manage their own personas
CREATE POLICY "Users can manage own personas" ON public.audience_personas
  FOR ALL USING (user_id = auth.uid() OR created_by = auth.uid());

-- Insert default system personas (matching lib/personas.ts)
INSERT INTO public.audience_personas (
  id, name, age_range, description, full_description, tone, style, is_system, times_used
) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Sarah',
    '25-30',
    'Energetic lifestyle content creator',
    'Young professional who loves trying new products and sharing authentic experiences. High energy, relatable, trend-aware.',
    'enthusiastic',
    'casual',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Mike',
    '32-38',
    'Skeptical product reviewer',
    'No-nonsense reviewer who cuts through the hype. Direct, honest, values quality over trends.',
    'straightforward',
    'analytical',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'Jessica',
    '20-26',
    'Gen-Z trend expert',
    'Always on top of the latest trends. Uses current slang, references pop culture, speaks to younger audiences.',
    'playful',
    'trendy',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'David',
    '38-46',
    'Dad humor specialist',
    'Relatable parent figure. Uses dad jokes, everyday situations, appeals to family audiences.',
    'warm',
    'humorous',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'Emma',
    '28-34',
    'Luxury lifestyle curator',
    'Sophisticated taste-maker. Focuses on premium quality, aesthetics, and elevated experiences.',
    'refined',
    'aspirational',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000006',
    'Marcus',
    '26-32',
    'High-energy hype creator',
    'Gets people excited! Fast-paced delivery, uses urgency, great for limited offers and launches.',
    'energetic',
    'urgent',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000007',
    'Lisa',
    '35-42',
    'Trusted expert advisor',
    'Knowledgeable and trustworthy. Explains benefits clearly, builds credibility, great for complex products.',
    'authoritative',
    'educational',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000008',
    'Tyler',
    '19-25',
    'Chaotic comedy creator',
    'Unpredictable and hilarious. Uses absurd humor, unexpected twists, very shareable content.',
    'chaotic',
    'comedic',
    true,
    0
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  age_range = EXCLUDED.age_range,
  description = EXCLUDED.description,
  full_description = EXCLUDED.full_description,
  tone = EXCLUDED.tone,
  style = EXCLUDED.style,
  is_system = EXCLUDED.is_system,
  updated_at = NOW();

-- Create index for faster system persona lookups
CREATE INDEX IF NOT EXISTS idx_audience_personas_is_system ON public.audience_personas(is_system);
CREATE INDEX IF NOT EXISTS idx_audience_personas_user_id ON public.audience_personas(user_id);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
