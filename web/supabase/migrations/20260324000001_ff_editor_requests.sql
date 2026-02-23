-- ============================================================
-- Editor Request Intake: stores /request-editor Discord intake
-- Migration: 20260324000001_ff_editor_requests
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ff_editor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Requester identity (Discord or future web intake)
  requester_user_id uuid,
  requester_discord_user_id text,
  requester_discord_username text,

  -- Request details
  budget_min int,
  budget_max int,
  turnaround text,
  weekly_volume int,
  style_notes text,
  reference_links text[],

  -- Pipeline state
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'matched', 'in_progress', 'completed', 'rejected')),
  assigned_editor_id uuid,
  ops_notes text
);

-- Indexes
CREATE INDEX idx_ff_editor_requests_status
  ON public.ff_editor_requests (status);

CREATE INDEX idx_ff_editor_requests_created
  ON public.ff_editor_requests (created_at DESC);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION ff_editor_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ff_editor_requests_updated_at
  BEFORE UPDATE ON public.ff_editor_requests
  FOR EACH ROW EXECUTE FUNCTION ff_editor_requests_updated_at();

-- RLS + service role policy (matches ff_agent_queue pattern)
ALTER TABLE public.ff_editor_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ff_editor_requests_service_write" ON public.ff_editor_requests;
CREATE POLICY "ff_editor_requests_service_write" ON public.ff_editor_requests
  FOR ALL USING (public.is_service_role());
