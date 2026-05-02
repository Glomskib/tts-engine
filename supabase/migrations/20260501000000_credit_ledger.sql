-- ─────────────────────────────────────────────────────────────────────────────
-- Credit Ledger — tracks credit balance for the Hook Generator (and any future
-- credit-billed feature). Append-only; balance is computed by summing deltas.
--
-- Design:
--   - Every change is a row. delta is positive (top-up, plan grant, refund) or
--     negative (debit on hook generation).
--   - balance_after is denormalized for fast reads + audit. The balance_after
--     of the latest row for a user IS that user's balance.
--   - reason is a short string ('top_up_100', 'hook_heygen', 'monthly_grant',
--     'refund_failed_job', etc.) — keep it stable for analytics.
--   - Job linkage is captured in metadata->>'job_id' rather than a hard FK so
--     the table works for any future credit-billed feature.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  balance_after INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
  ON public.credit_ledger (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- credit_balance(user_id) — returns the user's current balance.
-- O(1) thanks to the (user_id, created_at DESC) index — pulls the latest row.
-- Returns 0 if the user has no ledger entries yet.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.credit_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT balance_after
       FROM public.credit_ledger
       WHERE user_id = p_user_id
       ORDER BY created_at DESC
       LIMIT 1),
    0
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- credit_apply(user_id, delta, reason, metadata) — atomically appends a row.
-- Computes balance_after from the previous balance + delta.
-- Throws if the operation would leave a negative balance.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.credit_apply(
  p_user_id UUID,
  p_delta INTEGER,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_current INTEGER;
  v_next INTEGER;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'credit_apply: reason is required';
  END IF;

  -- Lock the user's most recent ledger row to prevent race on balance_after
  PERFORM 1 FROM public.credit_ledger
   WHERE user_id = p_user_id
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  v_current := public.credit_balance(p_user_id);
  v_next := v_current + p_delta;

  IF v_next < 0 THEN
    RAISE EXCEPTION 'credit_apply: insufficient credits (have %, requested %)', v_current, p_delta;
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, balance_after, metadata)
  VALUES (p_user_id, p_delta, p_reason, v_next, COALESCE(p_metadata, '{}'::jsonb));

  RETURN v_next;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — users can read their own ledger, but writes go through the RPC.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_ledger_self_read ON public.credit_ledger;
CREATE POLICY credit_ledger_self_read
  ON public.credit_ledger
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role bypasses RLS — that's how the API writes.
GRANT EXECUTE ON FUNCTION public.credit_balance(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_apply(UUID, INTEGER, TEXT, JSONB) TO service_role;
