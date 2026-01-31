-- 053_scheduled_posts.sql
-- Content calendar and scheduled posts

-- Create scheduled_posts table
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    skit_id UUID REFERENCES public.saved_skits(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    scheduled_for TIMESTAMPTZ NOT NULL,
    platform TEXT NOT NULL DEFAULT 'tiktok' CHECK (platform IN ('tiktok', 'instagram', 'youtube', 'all')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'posted', 'cancelled', 'failed')),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    posted_at TIMESTAMPTZ,
    CONSTRAINT scheduled_for_future CHECK (scheduled_for > created_at)
);

-- Index for calendar queries
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_date
ON public.scheduled_posts (user_id, scheduled_for);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status
ON public.scheduled_posts (status, scheduled_for);

-- Index for skit lookups
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_skit
ON public.scheduled_posts (skit_id)
WHERE skit_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own scheduled posts
CREATE POLICY "Users can read own scheduled posts"
ON public.scheduled_posts
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own scheduled posts
CREATE POLICY "Users can insert own scheduled posts"
ON public.scheduled_posts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own scheduled posts
CREATE POLICY "Users can update own scheduled posts"
ON public.scheduled_posts
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own scheduled posts
CREATE POLICY "Users can delete own scheduled posts"
ON public.scheduled_posts
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policy: Admins can read all
CREATE POLICY "Admins can read all scheduled posts"
ON public.scheduled_posts
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_scheduled_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_scheduled_posts_updated_at ON public.scheduled_posts;
CREATE TRIGGER tr_scheduled_posts_updated_at
BEFORE UPDATE ON public.scheduled_posts
FOR EACH ROW EXECUTE FUNCTION public.update_scheduled_posts_updated_at();

-- Comments
COMMENT ON TABLE public.scheduled_posts IS 'Content calendar with scheduled posts for publishing';
COMMENT ON COLUMN public.scheduled_posts.platform IS 'Target platform: tiktok, instagram, youtube, or all';
COMMENT ON COLUMN public.scheduled_posts.status IS 'Post status: scheduled, posted, cancelled, or failed';
