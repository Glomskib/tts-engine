-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-tenancy follow-up: add org_id columns + dual-policy RLS.
--
-- This adds an `org_id` column to user-scoped tables and updates RLS to
-- ALSO accept rows owned by the user's current org. Existing user-based
-- policies are preserved as a fallback so nothing breaks for users who
-- haven't been assigned to an org yet.
--
-- Tables touched (each scoped to a user, where multi-tenancy makes sense):
--   - ai_edit_jobs
--   - tiktok_oauth_accounts
--   - affiliate_collaborations
--   - affiliate_commissions
--   - credit_ledger
--
-- For other user-scoped tables (winners_bank, scripts, etc.) — left alone
-- in this migration. Add columns + RLS individually when each becomes a
-- multi-tenant surface (e.g. when an agency wants to share Winners Bank
-- across the team).
--
-- All new ALTER TABLEs use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS where
-- supported, to keep this migration idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: backfill org_id from a user's personal org -----------------------

CREATE OR REPLACE FUNCTION public._backfill_org_id_from_user(
  p_table_name TEXT,
  p_user_col TEXT DEFAULT 'user_id'
) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
  v_sql TEXT;
BEGIN
  v_sql := format(
    'UPDATE public.%I t SET org_id = o.id FROM public.organizations o '
    'WHERE t.%I = o.owner_user_id AND o.is_personal = TRUE AND t.org_id IS NULL',
    p_table_name, p_user_col
  );
  EXECUTE v_sql;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ai_edit_jobs ------------------------------------------------------------
-- Existence-guard: only run if the table is present in this DB.

DO $$
BEGIN
  IF to_regclass('public.ai_edit_jobs') IS NOT NULL THEN
    -- Add column
    EXECUTE 'ALTER TABLE public.ai_edit_jobs ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ai_edit_jobs_org ON public.ai_edit_jobs(org_id)';
    PERFORM public._backfill_org_id_from_user('ai_edit_jobs');

    -- Augment RLS — keep the existing user-based policy + add org-based
    EXECUTE 'DROP POLICY IF EXISTS ai_edit_jobs_org_member_read ON public.ai_edit_jobs';
    EXECUTE
      'CREATE POLICY ai_edit_jobs_org_member_read ON public.ai_edit_jobs '
      'FOR SELECT USING (org_id IS NOT NULL AND public.is_org_member(org_id))';
  END IF;
END$$;

-- tiktok_oauth_accounts ---------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.tiktok_oauth_accounts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tiktok_oauth_accounts ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tt_oauth_org ON public.tiktok_oauth_accounts(org_id)';
    PERFORM public._backfill_org_id_from_user('tiktok_oauth_accounts');

    EXECUTE 'DROP POLICY IF EXISTS tiktok_oauth_accounts_org_member_read ON public.tiktok_oauth_accounts';
    EXECUTE
      'CREATE POLICY tiktok_oauth_accounts_org_member_read ON public.tiktok_oauth_accounts '
      'FOR SELECT USING (org_id IS NOT NULL AND public.is_org_member(org_id))';
  END IF;
END$$;

-- affiliate_collaborations ------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.affiliate_collaborations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.affiliate_collaborations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_aff_collabs_org ON public.affiliate_collaborations(org_id)';
    PERFORM public._backfill_org_id_from_user('affiliate_collaborations');

    EXECUTE 'DROP POLICY IF EXISTS affiliate_collabs_org_member_read ON public.affiliate_collaborations';
    EXECUTE
      'CREATE POLICY affiliate_collabs_org_member_read ON public.affiliate_collaborations '
      'FOR SELECT USING (org_id IS NOT NULL AND public.is_org_member(org_id))';
  END IF;
END$$;

-- affiliate_commissions ---------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.affiliate_commissions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.affiliate_commissions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_aff_commissions_org ON public.affiliate_commissions(org_id)';
    PERFORM public._backfill_org_id_from_user('affiliate_commissions');

    EXECUTE 'DROP POLICY IF EXISTS affiliate_commissions_org_member_read ON public.affiliate_commissions';
    EXECUTE
      'CREATE POLICY affiliate_commissions_org_member_read ON public.affiliate_commissions '
      'FOR SELECT USING (org_id IS NOT NULL AND public.is_org_member(org_id))';
  END IF;
END$$;

-- credit_ledger -----------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.credit_ledger') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.credit_ledger ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_credit_ledger_org ON public.credit_ledger(org_id)';
    PERFORM public._backfill_org_id_from_user('credit_ledger');

    EXECUTE 'DROP POLICY IF EXISTS credit_ledger_org_member_read ON public.credit_ledger';
    EXECUTE
      'CREATE POLICY credit_ledger_org_member_read ON public.credit_ledger '
      'FOR SELECT USING (org_id IS NOT NULL AND public.is_org_member(org_id))';
  END IF;
END$$;
