-- 052_user_activity.sql
-- User activity feed for script/skit actions

-- Create user_activity table
CREATE TABLE IF NOT EXISTS public.user_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN (
        'script_generated',
        'script_saved',
        'script_edited',
        'script_deleted',
        'script_favorited',
        'script_unfavorited',
        'script_exported',
        'script_duplicated',
        'collection_created',
        'collection_deleted',
        'template_used',
        'version_restored'
    )),
    entity_type TEXT NOT NULL DEFAULT 'skit',
    entity_id UUID NULL,
    entity_name TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user activity feed (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_user_activity_user_created
ON public.user_activity (user_id, created_at DESC);

-- Index for action type filtering
CREATE INDEX IF NOT EXISTS idx_user_activity_action
ON public.user_activity (action, created_at DESC);

-- Index for entity lookups
CREATE INDEX IF NOT EXISTS idx_user_activity_entity
ON public.user_activity (entity_type, entity_id, created_at DESC)
WHERE entity_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own activity
CREATE POLICY "Users can read own activity"
ON public.user_activity
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Admins can read all activity
CREATE POLICY "Admins can read all activity"
ON public.user_activity
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- SECURITY DEFINER function for logging activity
CREATE OR REPLACE FUNCTION public.log_user_activity(
    p_action TEXT,
    p_entity_type TEXT DEFAULT 'skit',
    p_entity_id UUID DEFAULT NULL,
    p_entity_name TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO public.user_activity (user_id, action, entity_type, entity_id, entity_name, metadata)
    VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_entity_name, p_metadata)
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.log_user_activity(TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

-- Comments
COMMENT ON TABLE public.user_activity IS 'Tracks user actions for activity feed';
COMMENT ON FUNCTION public.log_user_activity IS 'Log user activity with automatic user_id from auth context';

-- Trigger to auto-log script saves
CREATE OR REPLACE FUNCTION public.log_skit_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.user_activity (user_id, action, entity_type, entity_id, entity_name, metadata)
        VALUES (
            COALESCE(NEW.user_id, auth.uid()),
            'script_saved',
            'skit',
            NEW.id,
            NEW.title,
            jsonb_build_object('product_name', NEW.product_name, 'product_brand', NEW.product_brand)
        );
    ELSIF TG_OP = 'UPDATE' THEN
        -- Only log if significant changes (not just timestamps)
        IF NEW.skit_data IS DISTINCT FROM OLD.skit_data OR NEW.title IS DISTINCT FROM OLD.title THEN
            INSERT INTO public.user_activity (user_id, action, entity_type, entity_id, entity_name, metadata)
            VALUES (
                COALESCE(NEW.user_id, auth.uid()),
                'script_edited',
                'skit',
                NEW.id,
                NEW.title,
                jsonb_build_object('changed_fields',
                    CASE
                        WHEN NEW.title IS DISTINCT FROM OLD.title AND NEW.skit_data IS DISTINCT FROM OLD.skit_data THEN 'title, content'
                        WHEN NEW.title IS DISTINCT FROM OLD.title THEN 'title'
                        ELSE 'content'
                    END
                )
            );
        END IF;
        -- Log favorite changes
        IF NEW.is_favorite IS DISTINCT FROM OLD.is_favorite THEN
            INSERT INTO public.user_activity (user_id, action, entity_type, entity_id, entity_name, metadata)
            VALUES (
                COALESCE(NEW.user_id, auth.uid()),
                CASE WHEN NEW.is_favorite THEN 'script_favorited' ELSE 'script_unfavorited' END,
                'skit',
                NEW.id,
                NEW.title,
                '{}'::jsonb
            );
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.user_activity (user_id, action, entity_type, entity_id, entity_name, metadata)
        VALUES (
            COALESCE(OLD.user_id, auth.uid()),
            'script_deleted',
            'skit',
            OLD.id,
            OLD.title,
            '{}'::jsonb
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on saved_skits
DROP TRIGGER IF EXISTS tr_log_skit_activity ON public.saved_skits;
CREATE TRIGGER tr_log_skit_activity
AFTER INSERT OR UPDATE OR DELETE ON public.saved_skits
FOR EACH ROW EXECUTE FUNCTION public.log_skit_activity();
