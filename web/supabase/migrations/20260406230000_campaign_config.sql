-- ══════════════════════════════════════════════════════════════════
-- Campaign Generation Config
-- Adds campaign_config JSONB to experiments table so experiments
-- can double as campaign containers without a separate table.
-- ══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'experiments' AND column_name = 'campaign_config'
  ) THEN
    ALTER TABLE public.experiments
      ADD COLUMN campaign_config JSONB;

    COMMENT ON COLUMN experiments.campaign_config IS
      'Auto-campaign generation config: { hook_count, persona_ids, angles, platform, tone, cta_style, generation_status, generation_progress }';
  END IF;
END $$;
