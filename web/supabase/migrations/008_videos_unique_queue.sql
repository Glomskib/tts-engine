-- 008_videos_unique_queue.sql
-- Phase 8: Prevent duplicate queued videos per variant+account
-- Creates a partial unique index on (variant_id, account_id) for queue statuses

-- Drop if exists for idempotency
DROP INDEX IF EXISTS videos_unique_queue_variant_account;

-- Create partial unique index
-- Only enforces uniqueness when status is in queue states
CREATE UNIQUE INDEX videos_unique_queue_variant_account
ON public.videos (variant_id, account_id)
WHERE status IN ('needs_edit', 'ready_to_post');

-- Add comment for documentation
COMMENT ON INDEX videos_unique_queue_variant_account IS 
'Prevents duplicate videos for same variant+account in queue states (needs_edit, ready_to_post)';
