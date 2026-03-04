ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS posting_reminders_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS posting_reminder_lead_minutes INTEGER NOT NULL DEFAULT 30;
