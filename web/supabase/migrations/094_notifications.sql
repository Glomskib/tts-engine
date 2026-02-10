-- Migration 094: Extend Notifications System
-- Purpose: Add new columns and types for pipeline events, winner detection, VA activity
-- Builds on migration 017 which created the base notifications table

-- Add new columns to existing table
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Backfill: copy is_read to read for existing rows
UPDATE public.notifications SET read = is_read WHERE read IS NULL;

-- Drop old type constraint and add expanded one
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'handoff', 'assigned', 'status_changed', 'script_attached', 'comment',
    'va_submission', 'winner_detected', 'brand_quota', 'pipeline_idle',
    'drive_new_video', 'competitor_viral', 'system', 'info'
  ));

-- New index for the read column
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(user_id, read) WHERE read = FALSE;

-- Allow service role inserts
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE public.notifications IS 'In-app notifications for pipeline events, winners, VA activity, and workflow handoffs';
