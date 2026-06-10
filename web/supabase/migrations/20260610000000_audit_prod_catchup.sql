-- 2026-06-10 audit catch-up — ALREADY APPLIED TO PROD via SQL editor.
-- Idempotent record of the DDL run during the full-app audit (Claude/cowork).
-- Safe to re-run.
--
-- Context: footage_hub (20260402000000) and v1_create_flow (20260419000000)
-- were never applied to prod, so /api/footage and /api/clips/sets 500'd and
-- "Library doesn't save / videos don't upload". concepts also drifted from
-- the code (product_id NOT NULL, no user_id), 500-ing save-to-studio.

-- concepts: allow product-less concepts + per-user ownership
ALTER TABLE public.concepts ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS concepts_user_id_idx ON public.concepts(user_id);

-- footage hub (see 20260402000000_footage_hub.sql for the canonical version;
-- applied with RLS ENABLED on footage_items + footage_events — both tables
-- are accessed exclusively through the service role, which bypasses RLS).

-- v1 create flow (see 20260419000000_v1_create_flow.sql — applied verbatim).
