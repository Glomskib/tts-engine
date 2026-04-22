-- Add 'clipper' to the ve_mode enum so Video Engine runs can target the
-- long-form clipping workflow (sibling lane to affiliate / nonprofit).
-- Safe to run more than once.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 've_mode' AND e.enumlabel = 'clipper'
  ) THEN
    ALTER TYPE public.ve_mode ADD VALUE 'clipper';
  END IF;
END$$;

COMMENT ON TYPE public.ve_mode IS
  'Video Engine mode: affiliate = product/TikTok-Shop, nonprofit = mission-driven, clipper = long-form repurposing.';
