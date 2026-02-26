-- ============================================================
-- Seed canonical cc_projects rows (idempotent)
--
-- These are the three top-level projects that resolvers reference
-- by name (case-insensitive). Safe to re-run — skips existing rows.
-- ============================================================

INSERT INTO public.cc_projects (name, type, status, owner)
SELECT 'FlashFlow', 'product', 'active', 'system'
WHERE NOT EXISTS (
  SELECT 1 FROM public.cc_projects WHERE lower(name) = 'flashflow'
);

INSERT INTO public.cc_projects (name, type, status, owner)
SELECT 'MMM', 'nonprofit', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.cc_projects WHERE lower(name) = 'mmm'
);

INSERT INTO public.cc_projects (name, type, status, owner)
SELECT $$Zebby's World$$, 'product', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.cc_projects WHERE lower(name) = $$zebby's world$$
);
