-- Style Profiles: per-user writing style learned from approved scripts
-- Analyzes hook patterns, voice, CTA style, vocabulary from saved_skits

-- ============================================================================
-- Table: ff_style_profiles — one profile per user
-- ============================================================================

CREATE TABLE IF NOT EXISTS ff_style_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL,
  prompt_context TEXT NOT NULL,
  scripts_analyzed INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  built_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ff_style_profiles_user_id ON ff_style_profiles(user_id);

-- ============================================================================
-- Trigger: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_ff_style_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ff_style_profiles_updated_at ON ff_style_profiles;
CREATE TRIGGER trg_ff_style_profiles_updated_at
  BEFORE UPDATE ON ff_style_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_ff_style_profiles_updated_at();

-- ============================================================================
-- RLS: Users see only their own row
-- ============================================================================

ALTER TABLE ff_style_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ff_style_profiles_user_policy') THEN
    CREATE POLICY ff_style_profiles_user_policy ON ff_style_profiles FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
