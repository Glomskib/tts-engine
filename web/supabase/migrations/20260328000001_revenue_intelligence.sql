-- ============================================
-- Revenue Intelligence – Phase 1
-- TikTok Comment Intelligence Agent
-- ============================================

-- 1. Creator Accounts (connected social accounts for ingestion)
CREATE TABLE IF NOT EXISTS public.ri_creator_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'tiktok' CHECK (platform IN ('tiktok')),
  username TEXT NOT NULL,
  profile_url TEXT,
  automation_profile_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform, username)
);

CREATE INDEX idx_ri_creator_accounts_user ON ri_creator_accounts(user_id);
CREATE INDEX idx_ri_creator_accounts_active ON ri_creator_accounts(user_id, is_active) WHERE is_active = true;

ALTER TABLE ri_creator_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own creator accounts" ON ri_creator_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access ri_creator_accounts" ON ri_creator_accounts FOR ALL USING (auth.role() = 'service_role');


-- 2. Videos (videos discovered during comment ingestion)
CREATE TABLE IF NOT EXISTS public.ri_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_account_id UUID REFERENCES ri_creator_accounts(id) ON DELETE SET NULL,
  platform_video_id TEXT NOT NULL,
  caption TEXT,
  video_url TEXT,
  comment_count_at_scan INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform_video_id)
);

CREATE INDEX idx_ri_videos_user ON ri_videos(user_id);
CREATE INDEX idx_ri_videos_platform ON ri_videos(platform_video_id);

ALTER TABLE ri_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own ri videos" ON ri_videos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access ri_videos" ON ri_videos FOR ALL USING (auth.role() = 'service_role');


-- 3. Comments (raw ingested comments)
CREATE TABLE IF NOT EXISTS public.ri_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES ri_videos(id) ON DELETE CASCADE,
  platform_comment_id TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  commenter_username TEXT NOT NULL,
  commenter_display_name TEXT,
  like_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  is_reply BOOLEAN DEFAULT false,
  parent_comment_id TEXT,
  posted_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_json JSONB DEFAULT '{}'::jsonb,
  is_processed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, platform_comment_id)
);

CREATE INDEX idx_ri_comments_video ON ri_comments(video_id);
CREATE INDEX idx_ri_comments_user ON ri_comments(user_id);
CREATE INDEX idx_ri_comments_unprocessed ON ri_comments(user_id, is_processed) WHERE is_processed = false;
CREATE INDEX idx_ri_comments_ingested ON ri_comments(ingested_at DESC);

ALTER TABLE ri_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own ri comments" ON ri_comments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access ri_comments" ON ri_comments FOR ALL USING (auth.role() = 'service_role');


-- 4. Comment Analysis (AI classification results)
CREATE TABLE IF NOT EXISTS public.ri_comment_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL UNIQUE REFERENCES ri_comments(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'buying_intent', 'objection', 'shipping', 'support', 'praise', 'troll', 'general'
  )),
  subcategory TEXT,
  lead_score INTEGER NOT NULL CHECK (lead_score BETWEEN 0 AND 100),
  urgency_score INTEGER NOT NULL CHECK (urgency_score BETWEEN 0 AND 100),
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ri_analysis_comment ON ri_comment_analysis(comment_id);
CREATE INDEX idx_ri_analysis_category ON ri_comment_analysis(category);
CREATE INDEX idx_ri_analysis_lead_score ON ri_comment_analysis(lead_score DESC);
CREATE INDEX idx_ri_analysis_urgency ON ri_comment_analysis(urgency_score DESC);

ALTER TABLE ri_comment_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own analysis" ON ri_comment_analysis
  FOR ALL USING (
    EXISTS (SELECT 1 FROM ri_comments c WHERE c.id = comment_id AND c.user_id = auth.uid())
  );
CREATE POLICY "Service role full access ri_analysis" ON ri_comment_analysis FOR ALL USING (auth.role() = 'service_role');


-- 5. Reply Drafts (AI-generated reply suggestions)
CREATE TABLE IF NOT EXISTS public.ri_reply_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES ri_comments(id) ON DELETE CASCADE,
  tone TEXT NOT NULL CHECK (tone IN ('neutral', 'friendly', 'conversion')),
  draft_text TEXT NOT NULL,
  is_sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ri_drafts_comment ON ri_reply_drafts(comment_id);

ALTER TABLE ri_reply_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own drafts" ON ri_reply_drafts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM ri_comments c WHERE c.id = comment_id AND c.user_id = auth.uid())
  );
CREATE POLICY "Service role full access ri_drafts" ON ri_reply_drafts FOR ALL USING (auth.role() = 'service_role');


-- 6. Comment Status (user-facing workflow state)
CREATE TABLE IF NOT EXISTS public.ri_comment_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL UNIQUE REFERENCES ri_comments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'reviewed', 'resolved')),
  flagged_urgent BOOLEAN NOT NULL DEFAULT false,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ri_status_comment ON ri_comment_status(comment_id);
CREATE INDEX idx_ri_status_unread ON ri_comment_status(status) WHERE status = 'unread';
CREATE INDEX idx_ri_status_urgent ON ri_comment_status(flagged_urgent) WHERE flagged_urgent = true;

ALTER TABLE ri_comment_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own comment status" ON ri_comment_status
  FOR ALL USING (
    EXISTS (SELECT 1 FROM ri_comments c WHERE c.id = comment_id AND c.user_id = auth.uid())
  );
CREATE POLICY "Service role full access ri_status" ON ri_comment_status FOR ALL USING (auth.role() = 'service_role');


-- 7. Revenue Agent Logs (audit trail for all agent actions)
CREATE TABLE IF NOT EXISTS public.ri_agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ri_agent_logs_user ON ri_agent_logs(user_id);
CREATE INDEX idx_ri_agent_logs_action ON ri_agent_logs(action_type);
CREATE INDEX idx_ri_agent_logs_created ON ri_agent_logs(created_at DESC);

ALTER TABLE ri_agent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own agent logs" ON ri_agent_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access ri_logs" ON ri_agent_logs FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE ri_creator_accounts IS 'Connected social accounts for Revenue Intelligence comment ingestion';
COMMENT ON TABLE ri_videos IS 'Videos discovered during comment scanning';
COMMENT ON TABLE ri_comments IS 'Raw ingested comments from social platforms';
COMMENT ON TABLE ri_comment_analysis IS 'AI classification: category, lead score, urgency, confidence';
COMMENT ON TABLE ri_reply_drafts IS 'AI-generated reply drafts in 3 tones';
COMMENT ON TABLE ri_comment_status IS 'User-facing workflow state for each comment';
COMMENT ON TABLE ri_agent_logs IS 'Audit trail for all Revenue Intelligence agent actions';
