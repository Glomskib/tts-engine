-- Migration 017: Notifications system for VA workflow
-- Creates notifications table for handoffs, assignments, and status changes

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('handoff', 'assigned', 'status_changed', 'script_attached', 'comment')),
  video_id uuid NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at
  ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read
  ON public.notifications(user_id, is_read);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can SELECT their own notifications
CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can UPDATE their own notifications (for marking read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: No direct INSERT allowed (use function instead)
-- Admins insert via service role or SECURITY DEFINER function

-- Create SECURITY DEFINER function for inserting notifications
-- This allows the API to insert notifications for any user when appropriate
CREATE OR REPLACE FUNCTION public.insert_notification(
  target_user_id uuid,
  notification_type text,
  notification_video_id uuid,
  notification_payload jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  caller_role text;
  is_caller_admin boolean;
BEGIN
  -- Get caller's role
  SELECT role INTO caller_role
  FROM public.user_roles
  WHERE user_id = auth.uid();

  is_caller_admin := caller_role = 'admin';

  -- Allow insert if:
  -- 1. Caller is inserting for themselves, OR
  -- 2. Caller is an admin
  IF auth.uid() = target_user_id OR is_caller_admin THEN
    INSERT INTO public.notifications (user_id, type, video_id, payload)
    VALUES (target_user_id, notification_type, notification_video_id, notification_payload)
    RETURNING id INTO new_id;

    RETURN new_id;
  ELSE
    RAISE EXCEPTION 'Not authorized to insert notification for this user';
  END IF;
END;
$$;

-- Grant execute on the function to authenticated users
GRANT EXECUTE ON FUNCTION public.insert_notification(uuid, text, uuid, jsonb) TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.notifications IS 'User notifications for workflow events (handoffs, assignments, etc.)';
COMMENT ON FUNCTION public.insert_notification IS 'Securely insert a notification - only for self or by admins';
