-- ============================================
-- TikTok Sync Runs — per-user sync audit log
-- ============================================

CREATE TABLE IF NOT EXISTS public.tiktok_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error TEXT,
  videos_upserted INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_sync_runs_user ON tiktok_sync_runs(user_id, started_at DESC);

ALTER TABLE tiktok_sync_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own sync runs') THEN
    CREATE POLICY "Users see own sync runs" ON tiktok_sync_runs FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
