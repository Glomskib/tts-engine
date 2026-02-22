-- ============================================================
-- Issue Intake + Triage: ff_issue_reports, ff_issue_actions
-- Migration: 20260302100000_ff_issue_reports
-- ============================================================

-- ============================================================
-- 1. ff_issue_reports — inbound issue reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ff_issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,                  -- 'slack' | 'email' | 'api' | 'manual'
  reporter text,                         -- email, slack handle, etc.
  message_text text NOT NULL,
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'unknown',  -- unknown | low | medium | high | critical
  status text NOT NULL DEFAULT 'new',        -- new | triaged | in_progress | resolved | dismissed
  fingerprint text NOT NULL,             -- dedupe key (hash of source+message)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ff_issue_reports_fingerprint
  ON public.ff_issue_reports (fingerprint);
CREATE INDEX IF NOT EXISTS idx_ff_issue_reports_status
  ON public.ff_issue_reports (status);
CREATE INDEX IF NOT EXISTS idx_ff_issue_reports_severity
  ON public.ff_issue_reports (severity);
CREATE INDEX IF NOT EXISTS idx_ff_issue_reports_created_at
  ON public.ff_issue_reports (created_at);

ALTER TABLE public.ff_issue_reports ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "ff_issue_reports_service_write" ON public.ff_issue_reports;
CREATE POLICY "ff_issue_reports_service_write" ON public.ff_issue_reports
  FOR ALL USING (public.is_service_role());

-- Authenticated users can read issues they reported
DROP POLICY IF EXISTS "ff_issue_reports_read_own" ON public.ff_issue_reports;
CREATE POLICY "ff_issue_reports_read_own" ON public.ff_issue_reports
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND reporter = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER ff_issue_reports_updated_at
  BEFORE UPDATE ON public.ff_issue_reports
  FOR EACH ROW EXECUTE FUNCTION public.ff_set_updated_at();

-- ============================================================
-- 2. ff_issue_actions — actions taken on issues
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ff_issue_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.ff_issue_reports(id) ON DELETE CASCADE,
  action_type text NOT NULL,             -- 'intake' | 'triage' | 'assign' | 'resolve' | 'dismiss'
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ff_issue_actions_issue_id
  ON public.ff_issue_actions (issue_id);
CREATE INDEX IF NOT EXISTS idx_ff_issue_actions_action_type
  ON public.ff_issue_actions (action_type);

ALTER TABLE public.ff_issue_actions ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "ff_issue_actions_service_write" ON public.ff_issue_actions;
CREATE POLICY "ff_issue_actions_service_write" ON public.ff_issue_actions
  FOR ALL USING (public.is_service_role());

-- Authenticated users can read actions on issues they reported
DROP POLICY IF EXISTS "ff_issue_actions_read_own" ON public.ff_issue_actions;
CREATE POLICY "ff_issue_actions_read_own" ON public.ff_issue_actions
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND issue_id IN (
      SELECT id FROM public.ff_issue_reports
      WHERE reporter = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
