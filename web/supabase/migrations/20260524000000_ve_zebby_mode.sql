-- Add 'zebby' to the ve_mode enum so Video Engine runs can target the
-- Zebby's World content lane (sibling to affiliate / nonprofit / clipper).
--
-- Zebby mode is for atomizing chronic-illness-adjacent character content —
-- short clips pulled from the Zebby's World YouTube channel and adjacent
-- footage, scored to favor emotional moments, character dialogue, and
-- specificity (symptom names, body parts, conditions). Templates are
-- routed by clip_type so symptom-explainer and educational cuts get
-- app-install CTAs while character-moment cuts stay brand-protective
-- with follow-the-herd CTAs.
--
-- Safe to run more than once.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 've_mode' AND e.enumlabel = 'zebby'
  ) THEN
    ALTER TYPE public.ve_mode ADD VALUE 'zebby';
  END IF;
END$$;

COMMENT ON TYPE public.ve_mode IS
  'Video Engine mode: affiliate = product/TikTok-Shop, nonprofit = mission-driven, clipper = long-form repurposing, zebby = Zebby''s World character/chronic-illness content.';
