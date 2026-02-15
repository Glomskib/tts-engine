-- Separate Creator Personas from Customer Archetypes
-- Add persona_type column to distinguish between the two

-- Add persona_type column
ALTER TABLE public.audience_personas 
ADD COLUMN IF NOT EXISTS persona_type TEXT DEFAULT 'customer' CHECK (persona_type IN ('creator', 'customer'));

-- Mark the 6 built-in personas as 'creator' type
UPDATE public.audience_personas 
SET persona_type = 'creator'
WHERE id IN (
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0001-000000000002',
  '00000000-0000-0000-0001-000000000003',
  '00000000-0000-0000-0001-000000000004',
  '00000000-0000-0000-0001-000000000005',
  '00000000-0000-0000-0001-000000000006'
);

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_audience_personas_type ON public.audience_personas(persona_type);

-- Add comment
COMMENT ON COLUMN public.audience_personas.persona_type IS 
'Type of persona: creator (voice/style of content creator) or customer (target audience archetype)';
