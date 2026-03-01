CREATE TABLE IF NOT EXISTS public.ri_actions_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES ri_comments(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('reply', 'followup_script')),
  priority_score INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_review', 'approved', 'rejected', 'done')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedup_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ri_actions_queue_user_status ON ri_actions_queue(user_id, status);
CREATE INDEX idx_ri_actions_queue_user_priority ON ri_actions_queue(user_id, priority_score DESC);
CREATE UNIQUE INDEX idx_ri_actions_queue_dedup ON ri_actions_queue(dedup_key);

ALTER TABLE ri_actions_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own queue items" ON ri_actions_queue FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access ri_actions_queue" ON ri_actions_queue FOR ALL USING (auth.role() = 'service_role');
