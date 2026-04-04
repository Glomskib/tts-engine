-- Add unique constraint on user_id for drive_intake_connectors
-- Enables proper upsert behavior in OAuth callback.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dic_user_unique
  ON public.drive_intake_connectors (user_id);
