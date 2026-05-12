-- FlashFlow /create — Phase 0+1 schema additions
--
-- Adds:
--   1. brand_profiles — per-user voice profile for hook ranking + caption rewrite
--   2. feel_diagnosis + output_storage_url columns on ve_rendered_clips
--   3. deduct_credits(p_user_id, p_amount, p_description) RPC for multi-credit jobs
--   4. clip-sources storage bucket policy (private, owned by user)
--
-- Idempotent — safe to re-run.

-- ── 1. brand_profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  tone_descriptor     TEXT,
  sample_posts_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  style_notes         TEXT,
  prohibited_phrases  TEXT,
  preferred_phrases   TEXT,
  brand_color         TEXT,
  brand_font          TEXT,
  brand_logo_url      TEXT,
  watermark_url       TEXT,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_profiles_user_active
  ON public.brand_profiles(user_id, active);

-- RLS
ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own their brand profiles" ON public.brand_profiles;
CREATE POLICY "users own their brand profiles"
  ON public.brand_profiles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypass is automatic; admins use the service role.

-- ── 2. ve_rendered_clips additions for /create's progress view ──────
ALTER TABLE public.ve_rendered_clips
  ADD COLUMN IF NOT EXISTS feel_diagnosis     TEXT;
ALTER TABLE public.ve_rendered_clips
  ADD COLUMN IF NOT EXISTS output_storage_url TEXT;
ALTER TABLE public.ve_rendered_clips
  ADD COLUMN IF NOT EXISTS aspect_ratio       TEXT;
ALTER TABLE public.ve_rendered_clips
  ADD COLUMN IF NOT EXISTS caption_style      TEXT;

-- ── 3. deduct_credits RPC — multi-credit atomic deduction ───────────
-- Existing deduct_credit RPC always deducts 1. We need a variable-amount
-- version for /create jobs (clip_count × aspect_ratios).
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id     UUID,
  p_amount      INTEGER,
  p_description TEXT DEFAULT 'Multi-credit deduction'
)
RETURNS TABLE (success BOOLEAN, credits_remaining INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER;
  v_new     INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount < 1 THEN
    RETURN QUERY SELECT FALSE, 0, 'Invalid amount'::TEXT;
    RETURN;
  END IF;

  -- Lock the row
  SELECT credits_remaining INTO v_current
    FROM public.user_credits
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Initialize default credits row (5 free) and re-check
    INSERT INTO public.user_credits (user_id, credits_remaining, free_credits_total, free_credits_used, credits_used_this_period, lifetime_credits_used)
      VALUES (p_user_id, 5, 5, 0, 0, 0)
      ON CONFLICT (user_id) DO NOTHING;
    SELECT credits_remaining INTO v_current FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  IF v_current < p_amount THEN
    RETURN QUERY SELECT FALSE, COALESCE(v_current, 0), format('Insufficient credits — need %s, have %s', p_amount, v_current)::TEXT;
    RETURN;
  END IF;

  v_new := v_current - p_amount;

  UPDATE public.user_credits
     SET credits_remaining       = v_new,
         credits_used_this_period = COALESCE(credits_used_this_period, 0) + p_amount,
         lifetime_credits_used    = COALESCE(lifetime_credits_used, 0) + p_amount,
         updated_at               = NOW()
   WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, type, amount, balance_after, description)
    VALUES (p_user_id, 'usage', -p_amount, v_new, p_description);

  RETURN QUERY SELECT TRUE, v_new, 'ok'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credits(UUID, INTEGER, TEXT) TO authenticated, service_role;

-- ── 4. clip-sources storage bucket policy ───────────────────────────
-- Bucket is created lazily by /api/create/upload-url. We add a RLS-style
-- policy so signed URLs work and users can only read their own paths.
-- Note: bucket RLS requires the bucket to exist; this is defensive.
DO $$
BEGIN
  -- Insert bucket row if it doesn't exist (Supabase storage.buckets)
  INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('clip-sources', 'clip-sources', false, 5368709120)  -- 5GB
    ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  -- Catalog write may be restricted; not fatal — upload-url route also tries to create.
  NULL;
END$$;

-- Allow authenticated users to write objects with their own user_id prefix
DROP POLICY IF EXISTS "users upload to their own folder" ON storage.objects;
CREATE POLICY "users upload to their own folder"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'clip-sources'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "users read their own clip sources" ON storage.objects;
CREATE POLICY "users read their own clip sources"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'clip-sources'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- ── 5. credit_costs config table (referenced by future pricing UI) ──
CREATE TABLE IF NOT EXISTS public.credit_costs (
  action     TEXT PRIMARY KEY,
  cost       NUMERIC(8,2) NOT NULL,
  unit       TEXT NOT NULL,                  -- 'per_clip' | 'per_minute' | 'per_job' | 'per_100_words'
  notes      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.credit_costs (action, cost, unit, notes) VALUES
  ('script_generation',           1.0, 'per_job',       'Cheapest action, Claude call'),
  ('transcription',               1.0, 'per_5_minutes', 'Groq Whisper, ~$0.0001/min cost'),
  ('clip_render_base',            1.0, 'per_clip',      'Includes captions + reframe'),
  ('clip_render_aspect',          1.0, 'per_aspect',    'Additional aspect ratio on same source'),
  ('caption_reedit',              0.25,'per_clip',      'Caption-only re-render'),
  ('reframe_reedit',              0.5, 'per_clip',      'Vertical reframe only re-render'),
  ('voice_clone_tts',             1.0, 'per_100_words', 'ElevenLabs voice clone'),
  ('broll_auto_insert',           0.5, 'per_minute',    'AI b-roll generation'),
  ('thumbnail_generate',          1.0, 'per_image',     'AI thumbnail'),
  ('save_forever',                0.5, 'per_clip',      'Exempt clip from auto-delete')
ON CONFLICT (action) DO NOTHING;

-- ── 6. plans table for the new tier ladder ──────────────────────────
CREATE TABLE IF NOT EXISTS public.ff_plans (
  id                  TEXT PRIMARY KEY,         -- 'free' | 'starter' | 'creator' | 'pro' | 'content_fleet'
  display_name        TEXT NOT NULL,
  monthly_credits     INTEGER NOT NULL,
  monthly_price_cents INTEGER NOT NULL,
  features_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_days        INTEGER NOT NULL DEFAULT 7,
  max_resolution_p    INTEGER NOT NULL DEFAULT 720,
  brand_profiles_max  INTEGER NOT NULL DEFAULT 0,
  caption_styles      INTEGER NOT NULL DEFAULT 1,
  aspect_ratios       INTEGER NOT NULL DEFAULT 2,
  direct_publish      BOOLEAN NOT NULL DEFAULT FALSE,
  voice_clone_words   INTEGER NOT NULL DEFAULT 0,
  overage_rate_cents  INTEGER,                  -- cost per additional credit
  contact_us_only     BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_price_id     TEXT,
  visible             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ff_plans (id, display_name, monthly_credits, monthly_price_cents, storage_days, max_resolution_p, brand_profiles_max, caption_styles, aspect_ratios, direct_publish, voice_clone_words, overage_rate_cents, contact_us_only, features_json) VALUES
  ('free',          'Free',          3,    0,    7,   720,  0,  1, 2, FALSE, 0,    NULL, FALSE, '{"lifetime_only": true, "watermark": false}'),
  ('starter',       'Starter',       50,   1900, 30,  1080, 1,  6, 5, TRUE,  0,    20,   FALSE, '{}'),
  ('creator',       'Creator',       200,  4900, 90,  1080, 3,  6, 5, TRUE,  100,  20,   FALSE, '{}'),
  ('pro',           'Pro',           500,  9900, 365, 2160, 10, 6, 5, TRUE,  1000, 20,   FALSE, '{"custom_caption_font": true}'),
  ('content_fleet', 'Content Fleet', 9999, 0,    -1,  2160, 999,6, 5, TRUE,  9999, 15,   TRUE,  '{"agency": true, "team_seats": true, "white_label": true, "contact_us": true}')
ON CONFLICT (id) DO UPDATE SET
  display_name        = EXCLUDED.display_name,
  monthly_credits     = EXCLUDED.monthly_credits,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  storage_days        = EXCLUDED.storage_days,
  max_resolution_p    = EXCLUDED.max_resolution_p,
  brand_profiles_max  = EXCLUDED.brand_profiles_max,
  caption_styles      = EXCLUDED.caption_styles,
  aspect_ratios       = EXCLUDED.aspect_ratios,
  direct_publish      = EXCLUDED.direct_publish,
  voice_clone_words   = EXCLUDED.voice_clone_words,
  overage_rate_cents  = EXCLUDED.overage_rate_cents,
  contact_us_only     = EXCLUDED.contact_us_only,
  features_json       = EXCLUDED.features_json,
  updated_at          = NOW();
