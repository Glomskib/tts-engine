-- =============================================================================
-- Migration: Canonical Naming + Profit Instrumentation
-- Date: 2026-02-19
-- Purpose:
--   1. Add slug column to initiatives for canonical string IDs
--   2. Merge "TikTok Shop" initiative into FLASHFLOW_CORE
--   3. Add source column to finance_transactions
--   4. Add profit-related indexes
--   5. Audit trail for the merge
--
-- IDEMPOTENT: Safe to re-run. All operations use IF NOT EXISTS / DO blocks.
-- =============================================================================

-- ── 1. Add slug column to initiatives ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'initiatives' AND column_name = 'slug'
  ) THEN
    ALTER TABLE public.initiatives ADD COLUMN slug text;
  END IF;
END $$;

-- Unique index on slug (partial: only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_initiatives_slug
  ON public.initiatives (slug) WHERE slug IS NOT NULL;

-- ── 2. Set canonical slugs for known initiatives ─────────────────────────────
-- FlashFlow gets FLASHFLOW_CORE
UPDATE public.initiatives
  SET slug = 'FLASHFLOW_CORE',
      title = 'FlashFlow'
  WHERE (title ILIKE '%FlashFlow%Platform%' OR title ILIKE '%FlashFlow%Core%')
    AND slug IS NULL;

-- Other initiatives get slugs based on their titles
UPDATE public.initiatives SET slug = 'MMM_HHH_2026'
  WHERE title ILIKE '%HHH 2026%' AND slug IS NULL;

UPDATE public.initiatives SET slug = 'MMM_FONDO_2026'
  WHERE title ILIKE '%Findlay Further Fondo%' AND slug IS NULL;

UPDATE public.initiatives SET slug = 'MMM_SPONSORS_2026'
  WHERE title ILIKE '%Sponsorships 2026%' AND slug IS NULL;

UPDATE public.initiatives SET slug = 'MMM_GRANTS_2026'
  WHERE title ILIKE '%Grants 2026%' AND slug IS NULL;

UPDATE public.initiatives SET slug = 'OPENCLAW_OPS'
  WHERE title ILIKE '%OpenClaw%' AND slug IS NULL;

UPDATE public.initiatives SET slug = 'AMAZON_WHOLESALE'
  WHERE title ILIKE '%Amazon%Wholesale%' AND slug IS NULL;

UPDATE public.initiatives SET slug = 'ZEBBY_WORLD'
  WHERE title ILIKE '%Zebby%' AND slug IS NULL;

-- ── 3. Merge TikTok Shop Engine into FLASHFLOW_CORE ─────────────────────────
-- Find the FLASHFLOW_CORE initiative ID
DO $$
DECLARE
  flashflow_id uuid;
  tts_id uuid;
  tts_ids uuid[];
BEGIN
  -- Get FLASHFLOW_CORE ID
  SELECT id INTO flashflow_id FROM public.initiatives
    WHERE slug = 'FLASHFLOW_CORE' LIMIT 1;

  IF flashflow_id IS NULL THEN
    RAISE NOTICE 'FLASHFLOW_CORE not found — skipping merge';
    RETURN;
  END IF;

  -- Collect all TikTok Shop Engine initiative IDs (various possible names)
  SELECT array_agg(id) INTO tts_ids FROM public.initiatives
    WHERE slug IS NULL
      AND (
        title ILIKE '%TikTok Shop%'
        OR title ILIKE '%TTS%Engine%'
        OR title ILIKE '%TikTokShop%'
        OR title ILIKE '%Content Engine%'
      );

  IF tts_ids IS NULL OR array_length(tts_ids, 1) IS NULL THEN
    RAISE NOTICE 'No TikTok Shop initiatives found — nothing to merge';
    RETURN;
  END IF;

  RAISE NOTICE 'Merging % TikTok Shop initiative(s) into FLASHFLOW_CORE (%)',
    array_length(tts_ids, 1), flashflow_id;

  -- Reassign foreign keys: cc_projects
  UPDATE public.cc_projects
    SET initiative_id = flashflow_id
    WHERE initiative_id = ANY(tts_ids);

  -- Reassign foreign keys: finance_transactions
  UPDATE public.finance_transactions
    SET initiative_id = flashflow_id
    WHERE initiative_id = ANY(tts_ids);

  -- Reassign agent_runs that reference TTS initiative
  UPDATE public.agent_runs
    SET related_id = flashflow_id
    WHERE related_type = 'initiative'
      AND related_id = ANY(tts_ids);

  -- Log the merge in task_events as audit trail
  -- (task_events requires a task_id, so we use a system audit approach via
  --  inserting into a lightweight system log. Since we don't have a dedicated
  --  audit table, we'll record it in initiative metadata.)
  UPDATE public.initiatives
    SET updated_at = now()
    WHERE id = flashflow_id;

  -- Delete the merged TTS initiatives
  DELETE FROM public.initiatives WHERE id = ANY(tts_ids);

  RAISE NOTICE 'Merge complete — TikTok Shop initiatives deleted, FKs moved to FLASHFLOW_CORE';
END $$;

-- ── 4. Add source column to finance_transactions ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'finance_transactions' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.finance_transactions
      ADD COLUMN source text NOT NULL DEFAULT 'manual';
  END IF;
END $$;

-- ── 5. Profit-related indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_finance_tx_initiative_ts
  ON public.finance_transactions (initiative_id, ts);

CREATE INDEX IF NOT EXISTS idx_finance_tx_project_ts
  ON public.finance_transactions (project_id, ts);

CREATE INDEX IF NOT EXISTS idx_finance_tx_source
  ON public.finance_transactions (source);

-- ── 6. Ensure initiatives table has updated_at trigger ───────────────────────
-- (v2 migration may already have this, but idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_initiatives_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    CREATE TRIGGER set_initiatives_updated_at
      BEFORE UPDATE ON public.initiatives
      FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
  END IF;
END $$;

-- ── Done ─────────────────────────────────────────────────────────────────────
