-- Recording Sprints
-- Guided batch recording workflow for experiment content items.

CREATE TABLE IF NOT EXISTS recording_sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  experiment_id UUID NOT NULL REFERENCES experiments(id),
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  skipped_items INTEGER NOT NULL DEFAULT 0,
  current_index INTEGER NOT NULL DEFAULT 0,
  timer_minutes INTEGER, -- optional sprint timer (null = no timer)
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sprint items: ordered list of content items in the sprint
CREATE TABLE IF NOT EXISTS recording_sprint_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id UUID NOT NULL REFERENCES recording_sprints(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'recording', 'recorded', 'skipped')),
  recorded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recording_sprints_workspace ON recording_sprints(workspace_id);
CREATE INDEX IF NOT EXISTS idx_recording_sprints_experiment ON recording_sprints(experiment_id);
CREATE INDEX IF NOT EXISTS idx_sprint_items_sprint ON recording_sprint_items(sprint_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_sprint_items_content ON recording_sprint_items(content_item_id);
