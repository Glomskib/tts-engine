-- Migration 109: Atomic RPC functions for bulk video operations
-- Ensures archive/assign + event insert happen in a single transaction

-- Bulk archive: set status to ARCHIVED and insert events atomically
CREATE OR REPLACE FUNCTION bulk_archive_videos(
  p_video_ids UUID[],
  p_actor UUID,
  p_correlation_id TEXT
)
RETURNS TABLE(archived_count INT) AS $$
DECLARE
  v_count INT;
BEGIN
  -- Update status to ARCHIVED
  UPDATE videos
  SET status = 'ARCHIVED',
      last_status_changed_at = NOW()
  WHERE id = ANY(p_video_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Insert archive events
  INSERT INTO video_events (video_id, event_type, correlation_id, actor, details)
  SELECT unnest(p_video_ids), 'archived', p_correlation_id, p_actor,
         jsonb_build_object('bulk_operation', true);

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bulk assign: set assigned_to/assigned_at/assigned_by and insert events atomically
CREATE OR REPLACE FUNCTION bulk_assign_videos(
  p_video_ids UUID[],
  p_assignee_user_id UUID,
  p_assigned_by UUID,
  p_correlation_id TEXT
)
RETURNS TABLE(assigned_count INT) AS $$
DECLARE
  v_count INT;
BEGIN
  -- Update assignments
  UPDATE videos
  SET assigned_to = p_assignee_user_id,
      assigned_at = NOW(),
      assigned_by = p_assigned_by
  WHERE id = ANY(p_video_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Insert assignment events
  INSERT INTO video_events (video_id, event_type, correlation_id, actor, details)
  SELECT unnest(p_video_ids), 'assigned', p_correlation_id, p_assigned_by,
         jsonb_build_object('assignee_user_id', p_assignee_user_id::text, 'bulk_operation', true);

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
