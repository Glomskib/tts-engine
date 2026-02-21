-- FlashFlow PromptOps — prompt registry, version control, A/B rollout
-- Tables: ff_prompt_templates, ff_prompt_versions, ff_prompt_assignments
-- Also adds prompt_version_id to ff_generations.

-- =============================================
-- 1. ff_prompt_templates — one row per prompt template
-- =============================================
CREATE TABLE IF NOT EXISTS ff_prompt_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key               text NOT NULL UNIQUE,
  title             text NOT NULL,
  description       text,
  output_schema_json jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- 2. ff_prompt_versions — versioned prompt content
-- =============================================
CREATE TABLE IF NOT EXISTS ff_prompt_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         uuid NOT NULL REFERENCES ff_prompt_templates(id) ON DELETE CASCADE,
  version             integer NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  system_prompt       text,
  developer_prompt    text,
  user_prompt_template text,
  guardrails_json     jsonb NOT NULL DEFAULT '{}',
  scoring_rubric_json jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text
);

CREATE UNIQUE INDEX idx_ff_prompt_versions_tmpl_ver
  ON ff_prompt_versions(template_id, version);

CREATE INDEX idx_ff_prompt_versions_status
  ON ff_prompt_versions(status);

-- =============================================
-- 3. ff_prompt_assignments — active version per template
-- =============================================
CREATE TABLE IF NOT EXISTS ff_prompt_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid NOT NULL UNIQUE REFERENCES ff_prompt_templates(id) ON DELETE CASCADE,
  active_version_id uuid NOT NULL REFERENCES ff_prompt_versions(id) ON DELETE CASCADE,
  rollout_strategy  text NOT NULL DEFAULT 'all' CHECK (rollout_strategy IN ('all','percent','by_user','by_lane')),
  rollout_percent   integer NOT NULL DEFAULT 100,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Reuse existing ff_set_updated_at() trigger from 20260223000001
CREATE TRIGGER trg_ff_prompt_assignments_updated
  BEFORE UPDATE ON ff_prompt_assignments
  FOR EACH ROW EXECUTE FUNCTION ff_set_updated_at();

-- =============================================
-- 4. ALTER ff_generations — add prompt_version_id
-- =============================================
ALTER TABLE ff_generations
  ADD COLUMN IF NOT EXISTS prompt_version_id uuid;

CREATE INDEX idx_ff_generations_prompt_version_id
  ON ff_generations(prompt_version_id)
  WHERE prompt_version_id IS NOT NULL;

-- =============================================
-- 5. RLS policies
-- =============================================

ALTER TABLE ff_prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_prompt_assignments ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all prompt config (needed for resolver)
CREATE POLICY "ff_prompt_templates_select" ON ff_prompt_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ff_prompt_versions_select" ON ff_prompt_versions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ff_prompt_assignments_select" ON ff_prompt_assignments
  FOR SELECT TO authenticated USING (true);

-- No direct insert/update/delete for authenticated users;
-- all writes go through service role in API routes.
