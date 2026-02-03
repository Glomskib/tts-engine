-- ============================================================================
-- EXPANDED PERSONAS - Add 12 new diverse personas for script generation
-- ============================================================================

-- Add category column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audience_personas' AND column_name = 'category'
  ) THEN
    ALTER TABLE public.audience_personas ADD COLUMN category TEXT;
  END IF;
END $$;

-- Add gender and lifestyle columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audience_personas' AND column_name = 'gender'
  ) THEN
    ALTER TABLE public.audience_personas ADD COLUMN gender TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audience_personas' AND column_name = 'lifestyle'
  ) THEN
    ALTER TABLE public.audience_personas ADD COLUMN lifestyle TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audience_personas' AND column_name = 'humor_style'
  ) THEN
    ALTER TABLE public.audience_personas ADD COLUMN humor_style TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audience_personas' AND column_name = 'platforms'
  ) THEN
    ALTER TABLE public.audience_personas ADD COLUMN platforms TEXT[] DEFAULT '{}';
  END IF;
END $$;

-- Update existing personas with categories
UPDATE public.audience_personas SET category = 'lifestyle' WHERE name = 'Sarah';
UPDATE public.audience_personas SET category = 'tech' WHERE name = 'Mike';
UPDATE public.audience_personas SET category = 'lifestyle' WHERE name = 'Jessica';
UPDATE public.audience_personas SET category = 'comedy' WHERE name = 'David';
UPDATE public.audience_personas SET category = 'luxury' WHERE name = 'Emma';
UPDATE public.audience_personas SET category = 'comedy' WHERE name = 'Marcus';
UPDATE public.audience_personas SET category = 'educational' WHERE name = 'Lisa';
UPDATE public.audience_personas SET category = 'comedy' WHERE name = 'Tyler';

-- Insert 12 new diverse personas
INSERT INTO public.audience_personas (
  id, name, age_range, description, full_description, tone, style, gender, lifestyle, humor_style, platforms, category, is_system, times_used
) VALUES
  (
    '00000000-0000-0000-0000-000000000009',
    'Alex Chen',
    '30-35',
    'Tech reviewer who does deep-dive comparisons',
    'Loves specs, benchmarks, and finding the best value. Appeals to informed buyers who research before purchasing.',
    'analytical',
    'thorough',
    'male',
    'Tech enthusiast, early adopter, works in software',
    'Dry wit, tech puns, "let me explain why this matters"',
    ARRAY['youtube', 'tiktok'],
    'tech',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000010',
    'Priya Sharma',
    '25-30',
    'Beauty and skincare guru focused on ingredients',
    'Breaks down products scientifically while keeping it accessible. Big on before/afters and honest reviews.',
    'educational',
    'enthusiastic',
    'female',
    'Skincare obsessed, ingredient-conscious, wellness-focused',
    'Relatable self-deprecation, "okay but seriously this changed my skin"',
    ARRAY['tiktok', 'instagram'],
    'beauty',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000011',
    'Carlos Rodriguez',
    '40-48',
    'Business coach and entrepreneur mentor',
    'Focuses on ROI, scaling, and practical business advice. No fluff, just results that matter.',
    'authoritative',
    'direct',
    'male',
    'Serial entrepreneur, investor, mentor',
    'Success stories, "let me tell you what actually works"',
    ARRAY['linkedin', 'youtube'],
    'business',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000012',
    'Zoe Martinez',
    '19-23',
    'College student and budget queen',
    'Finds affordable alternatives to expensive products. Masters the "dupe" content format.',
    'excited',
    'genuine',
    'female',
    'Student, budget-conscious, trend-aware',
    'Gen-Z humor, "no way this is only $12", shocked reactions',
    ARRAY['tiktok', 'instagram'],
    'budget',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000013',
    'James Wilson',
    '35-40',
    'Fitness coach specializing in transformations',
    'Before/after focused, motivational, practical workout and nutrition tips. Knows what actually works.',
    'motivational',
    'tough love',
    'male',
    'Fitness professional, meal prep enthusiast, early riser',
    'Gym bro energy but wholesome, "trust the process"',
    ARRAY['tiktok', 'instagram', 'youtube'],
    'fitness',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000014',
    'Nina Thompson',
    '32-38',
    'Working mom balancing kids and self-care',
    'Time-saving hacks, practical solutions, keeping it real about the chaos of modern parenting.',
    'warm',
    'practical',
    'female',
    'Working mom, efficiency expert, coffee-dependent',
    'Mom humor, "if I can do this with a toddler screaming..."',
    ARRAY['tiktok', 'instagram', 'facebook'],
    'lifestyle',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000015',
    'Derek Chang',
    '26-32',
    'Gaming and tech streamer',
    'Enthusiastic about new releases, builds community, speaks the language of gamers.',
    'hyped',
    'community-focused',
    'male',
    'Full-time content creator, competitive gamer, night owl',
    'Gaming references, memes, "chat, this is actually insane"',
    ARRAY['tiktok', 'youtube', 'twitch'],
    'tech',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000016',
    'Aisha Johnson',
    '24-28',
    'Fashion and style influencer',
    'Trend forecasting, outfit inspiration, making high fashion accessible to everyone.',
    'confident',
    'inspiring',
    'female',
    'Fashion-forward, thrift lover, sustainability-minded',
    'Fashion puns, "the way this outfit ate", dramatic reveals',
    ARRAY['tiktok', 'instagram'],
    'beauty',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000017',
    'Tom Bradley',
    '48-55',
    'DIY expert and home improvement guru',
    'Step-by-step tutorials, tool recommendations, "you can do this yourself" encouraging energy.',
    'patient',
    'instructional',
    'male',
    'Handy homeowner, workshop enthusiast, practical problem-solver',
    'Dad jokes, tool puns, "now here is where most people mess up"',
    ARRAY['youtube', 'tiktok'],
    'diy',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000018',
    'Luna Park',
    '28-34',
    'Wellness advocate for mental health and mindfulness',
    'Calm, grounding presence. Focuses on mental health, mindfulness, and holistic living.',
    'calm',
    'supportive',
    'female',
    'Yoga instructor, meditation practitioner, plant-based',
    'Gentle humor, "remember to breathe", soothing energy',
    ARRAY['tiktok', 'instagram', 'youtube'],
    'lifestyle',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000019',
    'Chris Foster',
    '33-40',
    'Food critic and home chef',
    'Restaurant reviews, recipe recreations, understanding and explaining flavor profiles.',
    'descriptive',
    'passionate',
    'male',
    'Foodie, home cook, restaurant explorer',
    'Food puns, dramatic tasting reactions, "the way the flavors just..."',
    ARRAY['tiktok', 'instagram', 'youtube'],
    'food',
    true,
    0
  ),
  (
    '00000000-0000-0000-0000-000000000020',
    'Sam Rivera',
    '26-32',
    'Travel content creator and adventure seeker',
    'Hidden gems finder, practical travel tips and hacks. Makes you want to book a flight.',
    'adventurous',
    'inspiring',
    'non-binary',
    'Digital nomad, adventure sports, cultural explorer',
    'Travel humor, "okay but no one talks about this", FOMO-inducing',
    ARRAY['tiktok', 'instagram', 'youtube'],
    'travel',
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
  gender = EXCLUDED.gender,
  lifestyle = EXCLUDED.lifestyle,
  humor_style = EXCLUDED.humor_style,
  platforms = EXCLUDED.platforms,
  category = EXCLUDED.category,
  is_system = EXCLUDED.is_system,
  updated_at = NOW();

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_audience_personas_category ON public.audience_personas(category);

-- ============================================================================
-- MIGRATION COMPLETE - 12 new personas added (total: 20 system personas)
-- ============================================================================
