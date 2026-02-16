-- Rename system personas that still have short plain first-name patterns
-- to descriptive names. Idempotent — only updates names matching short patterns.

DO $$
BEGIN
  -- Rename personas where name is a short first-name-only pattern
  -- and a description exists to derive a better name from
  UPDATE public.audience_personas
  SET
    name = CASE
      WHEN description IS NOT NULL AND length(description) > 10
      THEN initcap(substring(
        regexp_replace(description, '\s+', ' ', 'g')
        from 1 for 45
      ))
      ELSE name || ' — Persona'
    END,
    updated_at = NOW()
  WHERE is_system = true
    AND length(name) < 20
    AND name ~ '^[A-Z][a-z]+(\s[A-Z][a-z]+)?$'  -- Matches "Sarah" or "Alex Chen"
    AND name NOT LIKE '%-%'                        -- Skip already-hyphenated descriptive names
    AND name NOT LIKE '%The %'                     -- Skip "The Skeptic" style names
    AND name NOT LIKE '% the %';                   -- Skip already descriptive names

  RAISE NOTICE 'Persona names updated';
END $$;
