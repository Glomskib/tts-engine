-- 012: Add error_metadata to script_rewrites for storing failed attempt info
-- This allows tracking of AI rewrite failures with detailed error context

alter table public.script_rewrites
  add column if not exists error_metadata jsonb null;

comment on column public.script_rewrites.error_metadata is 'Stores error details when rewrite fails (parse errors, validation errors, raw response preview)';
