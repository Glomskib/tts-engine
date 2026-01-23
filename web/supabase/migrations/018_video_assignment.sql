-- Migration 018: Add assignment columns to videos table
-- Allows admins to assign videos to specific users

-- Add assigned_to column (references auth user)
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS assigned_to uuid NULL;

-- Add assigned_at timestamp
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS assigned_at timestamptz NULL;

-- Add assigned_by column to track who made the assignment
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS assigned_by uuid NULL;

-- Create index for efficient lookup of assigned videos
CREATE INDEX IF NOT EXISTS idx_videos_assigned_to
  ON public.videos(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.videos.assigned_to IS 'User ID of the person assigned to work on this video';
COMMENT ON COLUMN public.videos.assigned_at IS 'When the video was assigned';
COMMENT ON COLUMN public.videos.assigned_by IS 'User ID of the admin who made the assignment';
