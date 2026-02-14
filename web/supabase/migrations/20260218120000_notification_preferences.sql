-- Granular notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Email notifications
  email_script_of_day BOOLEAN NOT NULL DEFAULT true,
  email_credits_low BOOLEAN NOT NULL DEFAULT true,
  email_monthly_summary BOOLEAN NOT NULL DEFAULT true,
  email_winner_pattern BOOLEAN NOT NULL DEFAULT false,
  email_retainer_milestone BOOLEAN NOT NULL DEFAULT false,
  -- Telegram alerts (admin-only in practice)
  telegram_new_subscriber BOOLEAN NOT NULL DEFAULT true,
  telegram_payment_failed BOOLEAN NOT NULL DEFAULT true,
  telegram_bug_report BOOLEAN NOT NULL DEFAULT true,
  telegram_pipeline_error BOOLEAN NOT NULL DEFAULT true,
  telegram_every_script BOOLEAN NOT NULL DEFAULT false,
  -- Metadata
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notification prefs"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification prefs"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification prefs"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access notification prefs"
  ON notification_preferences FOR ALL
  USING (auth.role() = 'service_role');
