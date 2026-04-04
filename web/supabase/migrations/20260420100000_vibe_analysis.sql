-- Add vibe analysis to content_item_transcripts
ALTER TABLE content_item_transcripts
ADD COLUMN IF NOT EXISTS vibe_analysis JSONB;

-- Standalone vibe analyses from the public transcriber
CREATE TABLE IF NOT EXISTS transcriber_vibe_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip TEXT,
  source_url TEXT,
  transcript_text TEXT NOT NULL,
  duration_seconds NUMERIC(6,1),
  vibe_analysis JSONB NOT NULL,
  analysis_version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_transcriber_vibe_user
ON transcriber_vibe_analyses(user_id, created_at DESC)
WHERE user_id IS NOT NULL;

-- RLS: users can see their own, service role can see all
ALTER TABLE transcriber_vibe_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vibe analyses"
ON transcriber_vibe_analyses FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role full access on vibe analyses"
ON transcriber_vibe_analyses FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
