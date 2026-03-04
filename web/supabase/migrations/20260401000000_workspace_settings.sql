-- Workspace-level settings (Drive root folder, preferences, etc.)
-- One row per workspace. workspace_id = auth.users.id for now (single-tenant model).

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  drive_root_folder_id  text,          -- Google Drive folder ID for content item folders
  drive_root_folder_url text,          -- Web link for convenience
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

-- Users can read their own settings
CREATE POLICY "workspace_settings_select_own"
  ON workspace_settings FOR SELECT
  USING (workspace_id = auth.uid());

-- Users can upsert their own settings
CREATE POLICY "workspace_settings_upsert_own"
  ON workspace_settings FOR ALL
  USING (workspace_id = auth.uid())
  WITH CHECK (workspace_id = auth.uid());

-- Service role full access
CREATE POLICY "workspace_settings_service"
  ON workspace_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE TRIGGER trg_workspace_settings_updated_at
  BEFORE UPDATE ON workspace_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
