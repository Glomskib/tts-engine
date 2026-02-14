-- Expand notification_preferences with new feature toggles, digest, quiet hours, timezone
-- Adds columns if table exists from prior migration, or creates full table if not

DO $$
BEGIN
  -- Email notification columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'email_weekly_report') THEN
    ALTER TABLE notification_preferences ADD COLUMN email_weekly_report BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'email_retainer_alerts') THEN
    ALTER TABLE notification_preferences ADD COLUMN email_retainer_alerts BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'email_brief_analyzed') THEN
    ALTER TABLE notification_preferences ADD COLUMN email_brief_analyzed BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'email_video_graded') THEN
    ALTER TABLE notification_preferences ADD COLUMN email_video_graded BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'email_trend_alerts') THEN
    ALTER TABLE notification_preferences ADD COLUMN email_trend_alerts BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'email_milestone_reached') THEN
    ALTER TABLE notification_preferences ADD COLUMN email_milestone_reached BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'email_daily_digest') THEN
    ALTER TABLE notification_preferences ADD COLUMN email_daily_digest BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Push notification columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'push_new_orders') THEN
    ALTER TABLE notification_preferences ADD COLUMN push_new_orders BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'push_video_posted') THEN
    ALTER TABLE notification_preferences ADD COLUMN push_video_posted BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'push_retainer_deadline') THEN
    ALTER TABLE notification_preferences ADD COLUMN push_retainer_deadline BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'push_engagement_spike') THEN
    ALTER TABLE notification_preferences ADD COLUMN push_engagement_spike BOOLEAN NOT NULL DEFAULT true;
  END IF;

  -- Digest & scheduling
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'digest_frequency') THEN
    ALTER TABLE notification_preferences ADD COLUMN digest_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (digest_frequency IN ('daily', 'weekly', 'monthly', 'never'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'quiet_hours_start') THEN
    ALTER TABLE notification_preferences ADD COLUMN quiet_hours_start INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'quiet_hours_end') THEN
    ALTER TABLE notification_preferences ADD COLUMN quiet_hours_end INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'timezone') THEN
    ALTER TABLE notification_preferences ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/New_York';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'created_at') THEN
    ALTER TABLE notification_preferences ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;
