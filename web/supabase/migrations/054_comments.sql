-- 054_comments.sql
-- Collaboration comments for scripts with threading

-- Create comments table
CREATE TABLE IF NOT EXISTS public.script_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skit_id UUID NOT NULL REFERENCES public.saved_skits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.script_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    beat_index INTEGER,
    selection_start INTEGER,
    selection_end INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching comments by skit
CREATE INDEX IF NOT EXISTS idx_script_comments_skit
ON public.script_comments (skit_id, created_at);

-- Index for threading
CREATE INDEX IF NOT EXISTS idx_script_comments_parent
ON public.script_comments (parent_id)
WHERE parent_id IS NOT NULL;

-- Index for user's comments
CREATE INDEX IF NOT EXISTS idx_script_comments_user
ON public.script_comments (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.script_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read comments on skits they own or have access to
CREATE POLICY "Users can read comments on accessible skits"
ON public.script_comments
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.saved_skits
        WHERE id = script_comments.skit_id
        AND (user_id = auth.uid() OR is_public = true)
    )
    OR EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- RLS Policy: Users can insert comments on skits they own
CREATE POLICY "Users can comment on own skits"
ON public.script_comments
FOR INSERT
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1 FROM public.saved_skits
        WHERE id = script_comments.skit_id
        AND (user_id = auth.uid() OR is_public = true)
    )
);

-- RLS Policy: Users can update their own comments
CREATE POLICY "Users can update own comments"
ON public.script_comments
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own comments or comments on their skits
CREATE POLICY "Users can delete own comments or comments on own skits"
ON public.script_comments
FOR DELETE
USING (
    auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM public.saved_skits
        WHERE id = script_comments.skit_id
        AND user_id = auth.uid()
    )
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_script_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_script_comments_updated_at ON public.script_comments;
CREATE TRIGGER tr_script_comments_updated_at
BEFORE UPDATE ON public.script_comments
FOR EACH ROW EXECUTE FUNCTION public.update_script_comments_updated_at();

-- Add column to saved_skits if not exists for public sharing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'saved_skits' AND column_name = 'is_public'
    ) THEN
        ALTER TABLE public.saved_skits ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Comments
COMMENT ON TABLE public.script_comments IS 'Threaded comments for script collaboration';
COMMENT ON COLUMN public.script_comments.parent_id IS 'Parent comment for threading';
COMMENT ON COLUMN public.script_comments.beat_index IS 'Index of the beat this comment refers to';
COMMENT ON COLUMN public.script_comments.selection_start IS 'Start position of highlighted text';
COMMENT ON COLUMN public.script_comments.selection_end IS 'End position of highlighted text';
