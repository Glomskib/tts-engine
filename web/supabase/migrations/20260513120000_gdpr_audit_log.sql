-- GDPR / CCPA deletion audit log
--
-- Records every "Right to be Forgotten" deletion in an anonymized form
-- (hashed user_id + email — no PII) so we can prove compliance to regulators
-- without retaining personal data we just promised to delete.
--
-- Retention: forever. It's the legal-defense paper trail.

CREATE TABLE IF NOT EXISTS public.gdpr_deletion_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_hash  TEXT NOT NULL,
  email_hash    TEXT,
  deleted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stats_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ip     TEXT,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_log_deleted_at
  ON public.gdpr_deletion_log(deleted_at DESC);

-- No RLS — only the service role inserts here. Service role bypasses RLS.
-- We explicitly NEVER expose this table to authenticated users.
