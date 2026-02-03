-- Update audience persona names to descriptive archetypes
-- These names better describe the persona's mindset and approach

-- Original 12 expanded personas
UPDATE public.audience_personas SET name = 'Ingredient-Obsessed Researcher' WHERE name = 'Priya Sharma';
UPDATE public.audience_personas SET name = 'ROI-Focused Entrepreneur' WHERE name = 'Carlos Rodriguez';
UPDATE public.audience_personas SET name = 'Budget-Conscious Deal Hunter' WHERE name = 'Zoe Martinez';
UPDATE public.audience_personas SET name = 'Transformation Chaser' WHERE name = 'James Wilson';
UPDATE public.audience_personas SET name = 'Overwhelmed Supermom' WHERE name = 'Nina Thompson';
UPDATE public.audience_personas SET name = 'Tech-Hyped Early Adopter' WHERE name = 'Derek Chang';
UPDATE public.audience_personas SET name = 'Trend-Forward Fashionista' WHERE name = 'Aisha Johnson';
UPDATE public.audience_personas SET name = 'DIY Problem Solver' WHERE name = 'Tom Bradley';
UPDATE public.audience_personas SET name = 'Mindful Wellness Seeker' WHERE name = 'Luna Park';
UPDATE public.audience_personas SET name = 'Culinary Enthusiast' WHERE name = 'Chris Foster';
UPDATE public.audience_personas SET name = 'Adventure-Seeking Explorer' WHERE name = 'Sam Rivera';
UPDATE public.audience_personas SET name = 'Spec-Comparing Researcher' WHERE name = 'Alex Chen';

-- Original 8 personas (if they exist with human names)
UPDATE public.audience_personas SET name = 'Trend-Aware Lifestyle Creator' WHERE name = 'Sarah';
UPDATE public.audience_personas SET name = 'Skeptical Veteran Reviewer' WHERE name = 'Mike';
UPDATE public.audience_personas SET name = 'Gen-Z Trendsetter' WHERE name = 'Jessica';
UPDATE public.audience_personas SET name = 'Relatable Dad Jokester' WHERE name = 'David';
UPDATE public.audience_personas SET name = 'Aspirational Taste-Maker' WHERE name = 'Emma';
UPDATE public.audience_personas SET name = 'High-Energy Hype Machine' WHERE name = 'Marcus';
UPDATE public.audience_personas SET name = 'Trusted Expert Advisor' WHERE name = 'Lisa';
UPDATE public.audience_personas SET name = 'Chaotic Comedy King' WHERE name = 'Tyler';
