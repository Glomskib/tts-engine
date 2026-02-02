-- ============================================================================
-- CLEANUP ORPHANED VIDEO REQUESTS
-- Delete video_requests that have no user_id (old test data)
-- ============================================================================

-- Delete orphaned records (no user_id)
DELETE FROM video_requests WHERE user_id IS NULL;

-- Ensure user_id column has NOT NULL constraint going forward
-- (Only if the column already exists and we want to enforce it)
-- ALTER TABLE video_requests ALTER COLUMN user_id SET NOT NULL;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
