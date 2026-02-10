-- Migration 100: Fix triggers to use correct column names
-- The original triggers in migration 091 reference views_total, likes_total etc.
-- The canonical TikTok stats columns are tiktok_views, tiktok_likes etc. (migration 090)
-- This migration recreates the triggers with correct column references.

-- ============================================================================
-- FIX: update_account_engagement trigger
-- Was referencing views_total/likes_total/etc, now uses tiktok_views/tiktok_likes/etc
-- ============================================================================

CREATE OR REPLACE FUNCTION update_account_engagement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tiktok_accounts
  SET
    total_views = (
      SELECT COALESCE(SUM(tiktok_views), 0) FROM public.videos
      WHERE account_id = NEW.account_id AND recording_status = 'POSTED'
    ),
    total_likes = (
      SELECT COALESCE(SUM(tiktok_likes), 0) FROM public.videos
      WHERE account_id = NEW.account_id AND recording_status = 'POSTED'
    ),
    total_comments = (
      SELECT COALESCE(SUM(tiktok_comments), 0) FROM public.videos
      WHERE account_id = NEW.account_id AND recording_status = 'POSTED'
    ),
    total_shares = (
      SELECT COALESCE(SUM(tiktok_shares), 0) FROM public.videos
      WHERE account_id = NEW.account_id AND recording_status = 'POSTED'
    ),
    avg_engagement = (
      SELECT COALESCE(AVG(
        CASE
          WHEN tiktok_views > 0 THEN
            ((tiktok_likes + tiktok_comments + tiktok_shares)::DECIMAL / tiktok_views) * 100
          ELSE 0
        END
      ), 0)
      FROM public.videos
      WHERE account_id = NEW.account_id AND recording_status = 'POSTED' AND tiktok_views > 0
    ),
    updated_at = NOW()
  WHERE id = NEW.account_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger that fired on views_total changes
DROP TRIGGER IF EXISTS trigger_update_account_engagement ON public.videos;

-- Create new trigger that fires on tiktok_views changes
CREATE TRIGGER trigger_update_account_engagement
  AFTER UPDATE OF tiktok_views, tiktok_likes, tiktok_comments, tiktok_shares ON public.videos
  FOR EACH ROW
  WHEN (NEW.account_id IS NOT NULL)
  EXECUTE FUNCTION update_account_engagement();

-- ============================================================================
-- Service role full access for tables that need it
-- (Safety net — some tables may be missing service role policies)
-- ============================================================================

-- tiktok_accounts
DROP POLICY IF EXISTS "Service role full access tiktok_accounts" ON public.tiktok_accounts;
CREATE POLICY "Service role full access tiktok_accounts" ON public.tiktok_accounts
  FOR ALL USING (auth.role() = 'service_role');

-- competitors
DROP POLICY IF EXISTS "Service role full access competitors" ON public.competitors;
CREATE POLICY "Service role full access competitors" ON public.competitors
  FOR ALL USING (auth.role() = 'service_role');

-- competitor_videos
DROP POLICY IF EXISTS "Service role full access competitor_videos" ON public.competitor_videos;
CREATE POLICY "Service role full access competitor_videos" ON public.competitor_videos
  FOR ALL USING (auth.role() = 'service_role');

-- notifications
DROP POLICY IF EXISTS "Service role full access notifications" ON public.notifications;
CREATE POLICY "Service role full access notifications" ON public.notifications
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON FUNCTION update_account_engagement IS 'Recalculates tiktok_accounts stats from tiktok_views/likes/comments/shares columns';
