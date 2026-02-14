-- ============================================================================
-- RENAME SYSTEM PERSONAS THAT STILL HAVE PLAIN FIRST-NAME PATTERNS
-- Idempotent: only updates rows where name still matches the old value.
-- ============================================================================

-- Original 8 seed personas (from migration 065)
UPDATE public.audience_personas SET name = 'Trend-Aware Lifestyle Creator',  updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000001' AND name = 'Sarah';
UPDATE public.audience_personas SET name = 'Skeptical Veteran Reviewer',     updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000002' AND name = 'Mike';
UPDATE public.audience_personas SET name = 'Gen-Z Trendsetter',              updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000003' AND name = 'Jessica';
UPDATE public.audience_personas SET name = 'Relatable Dad Jokester',         updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000004' AND name = 'David';
UPDATE public.audience_personas SET name = 'Aspirational Taste-Maker',       updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000005' AND name = 'Emma';
UPDATE public.audience_personas SET name = 'High-Energy Hype Machine',       updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000006' AND name = 'Marcus';
UPDATE public.audience_personas SET name = 'Trusted Expert Advisor',         updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000007' AND name = 'Lisa';
UPDATE public.audience_personas SET name = 'Chaotic Comedy King',            updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000008' AND name = 'Tyler';

-- Expanded 12 personas (from migration 073)
UPDATE public.audience_personas SET name = 'Ingredient-Obsessed Researcher', updated_at = NOW() WHERE name = 'Priya Sharma'     AND is_system = true;
UPDATE public.audience_personas SET name = 'ROI-Focused Entrepreneur',       updated_at = NOW() WHERE name = 'Carlos Rodriguez'  AND is_system = true;
UPDATE public.audience_personas SET name = 'Budget-Conscious Deal Hunter',   updated_at = NOW() WHERE name = 'Zoe Martinez'     AND is_system = true;
UPDATE public.audience_personas SET name = 'Transformation Chaser',          updated_at = NOW() WHERE name = 'James Wilson'      AND is_system = true;
UPDATE public.audience_personas SET name = 'Overwhelmed Supermom',           updated_at = NOW() WHERE name = 'Nina Thompson'     AND is_system = true;
UPDATE public.audience_personas SET name = 'Tech-Hyped Early Adopter',       updated_at = NOW() WHERE name = 'Derek Chang'       AND is_system = true;
UPDATE public.audience_personas SET name = 'Trend-Forward Fashionista',      updated_at = NOW() WHERE name = 'Aisha Johnson'     AND is_system = true;
UPDATE public.audience_personas SET name = 'DIY Problem Solver',             updated_at = NOW() WHERE name = 'Tom Bradley'       AND is_system = true;
UPDATE public.audience_personas SET name = 'Mindful Wellness Seeker',        updated_at = NOW() WHERE name = 'Luna Park'         AND is_system = true;
UPDATE public.audience_personas SET name = 'Culinary Enthusiast',            updated_at = NOW() WHERE name = 'Chris Foster'      AND is_system = true;
UPDATE public.audience_personas SET name = 'Adventure-Seeking Explorer',     updated_at = NOW() WHERE name = 'Sam Rivera'        AND is_system = true;
UPDATE public.audience_personas SET name = 'Spec-Comparing Researcher',      updated_at = NOW() WHERE name = 'Alex Chen'         AND is_system = true;

-- Catch-all: rename any remaining system personas with short first-name-only patterns
-- that weren't caught above (e.g., user-created system personas with plain names)
UPDATE public.audience_personas
SET name = initcap(substring(regexp_replace(description, '\s+', ' ', 'g') from 1 for 45)),
    updated_at = NOW()
WHERE is_system = true
  AND length(name) < 15
  AND name ~ '^[A-Z][a-z]+$'
  AND description IS NOT NULL
  AND length(description) > 10;
