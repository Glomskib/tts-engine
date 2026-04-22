-- Mission Control Operational Upgrade
-- Adds lifecycle fields to project_tasks, health fields to agent tracking,
-- and new tables for interventions, task transitions, and integration health.
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ============================================================================
-- 1. project_tasks — lifecycle & operational fields
-- ============================================================================

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS last_transition_at timestamptz DEFAULT now();
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS stale_after_minutes integer DEFAULT 60;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS sla_minutes integer;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS escalation_level integer DEFAULT 0;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS requires_human_review boolean DEFAULT false;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS resolution_note text;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS proof_summary text;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS proof_url text;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS output_count integer DEFAULT 0;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS is_revenue_critical boolean DEFAULT false;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS session_dependency text;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS source_system text DEFAULT 'manual';
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS lane text;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS human_override boolean DEFAULT false;

-- ============================================================================
-- 2. task_transitions — full audit trail for task status changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by text NOT NULL DEFAULT 'system',
  reason text,
  ts timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_transitions_task_id ON task_transitions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_transitions_ts ON task_transitions(ts DESC);

-- ============================================================================
-- 3. intervention_queue — human action items
-- ============================================================================

CREATE TABLE IF NOT EXISTS intervention_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('stale_task', 'sla_breach', 'blocked_revenue', 'agent_failure', 'integration_down', 'proofless_completion', 'general')),
  source_type text, -- 'task', 'agent', 'integration', 'pipeline'
  source_id text,   -- ID of related entity
  lane text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intervention_queue_status ON intervention_queue(status);
CREATE INDEX IF NOT EXISTS idx_intervention_queue_severity ON intervention_queue(severity);
CREATE INDEX IF NOT EXISTS idx_intervention_queue_created ON intervention_queue(created_at DESC);

-- ============================================================================
-- 4. integration_health — track external service status
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'down', 'unknown')),
  last_check_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  error_count_24h integer DEFAULT 0,
  success_count_24h integer DEFAULT 0,
  meta jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_health_status ON integration_health(status);

-- ============================================================================
-- 5. incidents — operational incident log
-- ============================================================================

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'mitigated', 'resolved')),
  source text, -- 'auto', 'manual'
  related_service text,
  related_task_id uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  meta jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_opened ON incidents(opened_at DESC);
