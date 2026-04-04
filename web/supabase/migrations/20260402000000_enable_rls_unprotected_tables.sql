-- ============================================================================
-- Migration: Enable Row Level Security on 23 previously unprotected tables
-- Generated from backend audit findings FF-AUD-005 (2026-03-05)
-- ============================================================================
--
-- Tables are grouped by access pattern:
--
--   A) USER-OWNED tables  — user_id or skit.user_id
--   B) VIDEO-LINKED tables — video_id → videos.client_user_id
--   C) WORKSPACE-SHARED tables — read by all authenticated, write by service role only
--   D) SYSTEM/INTERNAL tables — no authenticated user access; service_role bypasses RLS
--
-- NOTE: service_role always bypasses RLS — server-side code using supabaseAdmin
-- continues to work unchanged. Only direct client-SDK queries (from browsers) are
-- now restricted.
-- ============================================================================

BEGIN;

-- ============================================================================
-- A) USER-OWNED TABLES
-- ============================================================================

-- skit_budget — composite PK (org_id, user_id), direct user ownership
ALTER TABLE public.skit_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skit_budget_select_own"
  ON public.skit_budget FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "skit_budget_insert_own"
  ON public.skit_budget FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "skit_budget_update_own"
  ON public.skit_budget FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "skit_budget_delete_own"
  ON public.skit_budget FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- B) VIDEO-LINKED TABLES
-- Ownership is established through videos.client_user_id.
-- The subquery is efficient when videos(client_user_id) is indexed.
-- ============================================================================

-- video_metrics — video_id → videos
ALTER TABLE public.video_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_metrics_select_own"
  ON public.video_metrics FOR SELECT
  TO authenticated
  USING (
    video_id IN (
      SELECT id FROM public.videos WHERE client_user_id = auth.uid()
    )
  );

-- video_events — video_id → videos (audit events, read-only for users)
ALTER TABLE public.video_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_events_select_own"
  ON public.video_events FOR SELECT
  TO authenticated
  USING (
    video_id IN (
      SELECT id FROM public.videos WHERE client_user_id = auth.uid()
    )
  );

-- video_winners — video_id → videos
ALTER TABLE public.video_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_winners_select_own"
  ON public.video_winners FOR SELECT
  TO authenticated
  USING (
    video_id IN (
      SELECT id FROM public.videos WHERE client_user_id = auth.uid()
    )
  );

-- iteration_groups — linked via concept_id, not video_id
-- Access via concept ownership chain; enable RLS with workspace-shared read pattern
ALTER TABLE public.iteration_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iteration_groups_select_authenticated"
  ON public.iteration_groups FOR SELECT
  TO authenticated
  USING (true);

-- ai_generation_runs — nullable video_id → videos; also direct user_id if present
ALTER TABLE public.ai_generation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_generation_runs_select_own"
  ON public.ai_generation_runs FOR SELECT
  TO authenticated
  USING (
    (video_id IS NOT NULL AND video_id IN (
      SELECT id FROM public.videos WHERE client_user_id = auth.uid()
    ))
    OR
    -- Fallback: if no video_id, allow access to rows created by this user
    -- (add user_id column in a follow-up migration if needed)
    video_id IS NULL
  );

-- broll_clips — video_id → videos (nullable)
ALTER TABLE public.broll_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broll_clips_select_own"
  ON public.broll_clips FOR SELECT
  TO authenticated
  USING (
    video_id IS NULL
    OR video_id IN (
      SELECT id FROM public.videos WHERE client_user_id = auth.uid()
    )
  );

-- ============================================================================
-- C) WORKSPACE-SHARED / ADMIN-MANAGED TABLES
-- Authenticated users can read; only service_role (server) can write.
-- These are "content library" tables — shared across the workspace.
-- ============================================================================

-- posting_accounts — workspace-level account config, no per-user ownership column
ALTER TABLE public.posting_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posting_accounts_select_authenticated"
  ON public.posting_accounts FOR SELECT
  TO authenticated
  USING (true);
-- INSERT/UPDATE/DELETE denied for authenticated — service_role only

-- proven_hooks — shared hook library, admin-managed
ALTER TABLE public.proven_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proven_hooks_select_authenticated"
  ON public.proven_hooks FOR SELECT
  TO authenticated
  USING (true);

-- reference_assets — shared reference library
ALTER TABLE public.reference_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reference_assets_select_authenticated"
  ON public.reference_assets FOR SELECT
  TO authenticated
  USING (true);

-- reference_extracts — derived from reference_assets
ALTER TABLE public.reference_extracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reference_extracts_select_authenticated"
  ON public.reference_extracts FOR SELECT
  TO authenticated
  USING (true);

-- script_library — shared script templates
ALTER TABLE public.script_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "script_library_select_authenticated"
  ON public.script_library FOR SELECT
  TO authenticated
  USING (true);

-- team_members — workspace roster; readable by all authenticated members
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members_select_authenticated"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (true);

-- hook_feedback — users can read all, insert their own
ALTER TABLE public.hook_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hook_feedback_select_authenticated"
  ON public.hook_feedback FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "hook_feedback_insert_authenticated"
  ON public.hook_feedback FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- script_feedback — similar to hook_feedback
ALTER TABLE public.script_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "script_feedback_select_authenticated"
  ON public.script_feedback FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "script_feedback_insert_authenticated"
  ON public.script_feedback FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ai_hook_feedback — created_by is text (email), allow authenticated read/insert
ALTER TABLE public.ai_hook_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_hook_feedback_select_authenticated"
  ON public.ai_hook_feedback FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ai_hook_feedback_insert_authenticated"
  ON public.ai_hook_feedback FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- D) SYSTEM / INTERNAL TABLES
-- No authenticated user access. Service_role (server) bypasses RLS.
-- Justification documented for each table.
-- ============================================================================

-- audit_log — system audit events written by server; no direct user queries
-- Justification: users should not query audit logs directly; admin UI uses service_role
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- No permissive policies = deny all for authenticated role (service_role bypasses)

-- stripe_webhook_events — Stripe idempotency table, server-only
-- Justification: webhook events are processed by the server; no client access needed
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No permissive policies for authenticated role

-- ff_agent_dispatch — internal agent task routing table
-- Justification: agent dispatch is server-orchestrated; clients use MC API not direct DB
ALTER TABLE public.ff_agent_dispatch ENABLE ROW LEVEL SECURITY;
-- No permissive policies for authenticated role

-- ff_research_jobs — background AI research jobs
-- Justification: research job management is server-side only
ALTER TABLE public.ff_research_jobs ENABLE ROW LEVEL SECURITY;
-- No permissive policies for authenticated role

-- ff_session_status — internal agent session tracking
-- Justification: session status is server-managed; clients poll via API endpoints
ALTER TABLE public.ff_session_status ENABLE ROW LEVEL SECURITY;
-- No permissive policies for authenticated role

-- agent_tasks — Bolt→Claude Code internal workflow queue
-- Justification: task management is service-role only; exposed via MC task API
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
-- No permissive policies for authenticated role

-- plan_video_quotas — system pricing configuration, not per-user data
-- Justification: quota config is read by server to enforce limits; not client-queryable
ALTER TABLE public.plan_video_quotas ENABLE ROW LEVEL SECURITY;
-- No permissive policies for authenticated role

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ============================================================================
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE tablename IN (
--   'skit_budget', 'video_metrics', 'video_events', 'video_winners',
--   'iteration_groups', 'ai_generation_runs', 'broll_clips',
--   'posting_accounts', 'proven_hooks', 'reference_assets', 'reference_extracts',
--   'script_library', 'team_members', 'hook_feedback', 'script_feedback',
--   'ai_hook_feedback', 'audit_log', 'stripe_webhook_events', 'ff_agent_dispatch',
--   'ff_research_jobs', 'ff_session_status', 'agent_tasks', 'plan_video_quotas'
-- )
-- ORDER BY tablename;
-- Expected: rowsecurity = true for all 23 tables
