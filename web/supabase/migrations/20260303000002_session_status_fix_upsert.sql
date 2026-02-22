-- Fix ff_session_status unique constraint for Supabase JS upsert compatibility.
-- COALESCE expressions in unique indexes aren't usable with supabase-js onConflict.
-- Replace with a simple (node_name, platform) unique constraint.

DROP INDEX IF EXISTS ff_session_status_node_platform_account_idx;

ALTER TABLE public.ff_session_status
  ADD CONSTRAINT ff_session_status_node_platform_key UNIQUE (node_name, platform);
