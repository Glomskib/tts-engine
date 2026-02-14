-- ============================================================================
-- SEED 6 NAMED BUILT-IN PERSONAS
-- These are the primary personas shown to all users.
-- Uses stable UUIDs so upserts are idempotent.
-- ============================================================================

-- Ensure required columns exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audience_personas' AND column_name = 'full_description') THEN
    ALTER TABLE public.audience_personas ADD COLUMN full_description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audience_personas' AND column_name = 'style') THEN
    ALTER TABLE public.audience_personas ADD COLUMN style TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audience_personas' AND column_name = 'is_system') THEN
    ALTER TABLE public.audience_personas ADD COLUMN is_system BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audience_personas' AND column_name = 'tone_preference') THEN
    ALTER TABLE public.audience_personas ADD COLUMN tone_preference TEXT;
  END IF;
END $$;

INSERT INTO public.audience_personas (
  id, name, description, full_description, tone, tone_preference, style, is_system, times_used, created_at, updated_at
) VALUES
(
  '00000000-0000-0000-0001-000000000001',
  'The Skeptic',
  'Questioning, data-driven buyer who needs proof before purchasing.',
  'A cautious consumer who has been burned by hype before. They research everything, read negative reviews first, and need hard evidence — clinical studies, ingredient lists, before/after proof — before committing. They respond to transparent, no-BS messaging that acknowledges flaws honestly.',
  'direct',
  'direct',
  'confrontational, evidence-based, cuts through hype',
  true, 0, NOW(), NOW()
),
(
  '00000000-0000-0000-0001-000000000002',
  'The Storyteller',
  'Emotionally-driven creator who connects through personal narratives.',
  'A natural communicator who weaves personal experiences into compelling content. They believe every product has a story worth telling and lean on vulnerability, humor, and relatable moments. They are less about specs and more about the transformation — the before-and-after emotional journey.',
  'warm',
  'warm',
  'narrative, vulnerable, transformation-focused',
  true, 0, NOW(), NOW()
),
(
  '00000000-0000-0000-0001-000000000003',
  'The Educator',
  'Knowledge-first communicator who teaches while they sell.',
  'An authority figure who earns trust by educating their audience before asking for anything. They break down complex topics into bite-sized, digestible content. They use analogies, step-by-step breakdowns, and "did you know" moments to hook viewers. Selling feels like a natural extension of helping.',
  'authoritative',
  'authoritative',
  'informative, structured, credibility-building',
  true, 0, NOW(), NOW()
),
(
  '00000000-0000-0000-0001-000000000004',
  'The Hype Man',
  'High-energy enthusiast who creates excitement and urgency.',
  'An unapologetically enthusiastic advocate who makes everything feel like the discovery of the century. They bring infectious energy, bold claims backed by genuine excitement, and a sense of urgency. Their content is fast-paced, punchy, and designed to make you stop scrolling and pay attention.',
  'high_energy',
  'high_energy',
  'energetic, bold, urgency-driven',
  true, 0, NOW(), NOW()
),
(
  '00000000-0000-0000-0001-000000000005',
  'The Relatable Friend',
  'Casual, approachable voice that feels like a friend recommending something.',
  'The person in your friend group who always knows about the best products. They share recommendations casually, like they are texting you about something they found. No pressure, no hard sell — just genuine "you have to try this" energy. Their content feels unscripted and authentic.',
  'conversational',
  'conversational',
  'casual, unscripted, peer-to-peer',
  true, 0, NOW(), NOW()
),
(
  '00000000-0000-0000-0001-000000000006',
  'The Honest Reviewer',
  'Balanced, thorough reviewer who covers pros and cons equally.',
  'A trusted voice who builds credibility through transparency. They always cover both the good and the bad, rate products on clear criteria, and never shy away from honest criticism. Their audience trusts them because they do not just promote — they evaluate. "Is it worth it?" is their signature question.',
  'balanced',
  'balanced',
  'analytical, transparent, trust-building',
  true, 0, NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  full_description = EXCLUDED.full_description,
  tone = EXCLUDED.tone,
  tone_preference = EXCLUDED.tone_preference,
  style = EXCLUDED.style,
  is_system = true,
  updated_at = NOW();
