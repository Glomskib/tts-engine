-- Weekly digest snapshots for user performance tracking
CREATE TABLE IF NOT EXISTS public.weekly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  scripts_generated INTEGER DEFAULT 0,
  top_script_id UUID,
  top_script_score NUMERIC(3,1),
  top_script_title TEXT,
  credits_used INTEGER DEFAULT 0,
  videos_posted INTEGER DEFAULT 0,
  retainer_videos_posted INTEGER DEFAULT 0,
  retainer_videos_goal INTEGER,
  content_idea_persona TEXT,
  content_idea_product TEXT,
  content_idea_angle_lift NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

-- Index for efficient weekly lookups
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_user_week
  ON public.weekly_snapshots(user_id, week_start DESC);

-- RLS: users can view only their own snapshots
ALTER TABLE public.weekly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots"
  ON public.weekly_snapshots FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert/update
CREATE POLICY "Service role can insert"
  ON public.weekly_snapshots FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update"
  ON public.weekly_snapshots FOR UPDATE
  WITH CHECK (true);
