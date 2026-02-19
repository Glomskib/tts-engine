-- ============================================================
-- Command Center v3: sort_order for Kanban drag-and-drop
-- ============================================================

-- Add sort_order to project_tasks for ordering within status columns
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Composite index for status-based queries with ordering
CREATE INDEX IF NOT EXISTS idx_project_tasks_status_sort
  ON public.project_tasks (status, sort_order);
