-- Migration Verification Script
-- Run this in Supabase SQL Editor to verify all tables exist.
-- Last updated: 2026-02-04

-- 1. List all public tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Check critical tables exist (returns missing ones)
WITH required_tables(name) AS (
  VALUES
    -- Core content
    ('products'),
    ('brands'),
    ('concepts'),
    ('hooks'),
    ('scripts'),
    ('script_templates'),
    ('script_rewrites'),
    -- Skits & generation
    ('saved_skits'),
    ('skit_versions'),
    ('skit_ratings'),
    ('skit_budget'),
    ('saved_hooks'),
    -- Videos & pipeline
    ('videos'),
    ('video_events'),
    ('video_assets'),
    ('video_metrics'),
    ('video_scripts'),
    ('video_script_versions'),
    ('video_ingestion_jobs'),
    ('video_ingestion_rows'),
    ('video_external_ids'),
    ('video_enrichment_tasks'),
    -- Winners
    ('reference_videos'),
    ('reference_assets'),
    ('reference_extracts'),
    ('winners_bank'),
    ('winner_patterns'),
    ('video_winners'),
    -- Audience
    ('audience_personas'),
    ('pain_points'),
    ('language_patterns'),
    -- AI & feedback
    ('ai_generation_runs'),
    ('ai_hook_feedback'),
    ('hook_suggestions'),
    ('hook_feedback'),
    ('hook_usage_events'),
    ('script_feedback'),
    ('proven_hooks'),
    ('script_library'),
    -- Billing & subscriptions
    ('subscription_plans'),
    ('user_subscriptions'),
    ('user_credits'),
    ('credit_transactions'),
    ('credit_packages'),
    ('credit_purchases'),
    ('plan_features'),
    ('plan_video_quotas'),
    -- User & auth
    ('user_roles'),
    ('user_activity'),
    ('notifications'),
    ('team_members'),
    -- Agency & clients
    ('agency_clients'),
    ('client_orgs'),
    ('client_org_members'),
    ('client_projects'),
    ('client_requests'),
    ('video_requests'),
    -- Content features
    ('collections'),
    ('collection_items'),
    ('scheduled_posts'),
    ('script_comments'),
    ('posting_accounts'),
    ('iteration_groups'),
    ('imported_videos'),
    -- B-Roll & images
    ('b_roll_library'),
    ('reference_images'),
    ('generated_images'),
    -- Logging
    ('audit_log'),
    -- Video editing service
    ('showcase_videos'),
    ('video_editing_clients'),
    ('video_editing_requests'),
    ('video_service_inquiries')
)
SELECT r.name AS missing_table
FROM required_tables r
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = r.name
WHERE t.table_name IS NULL
ORDER BY r.name;

-- 3. Check critical functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'deduct_credit',
    'add_credits',
    'reset_monthly_credits',
    'initialize_user_credits',
    'add_purchased_credits',
    'apply_skit_budget',
    'current_user_role',
    'insert_notification',
    'log_user_activity',
    'deduct_video',
    'reset_monthly_videos',
    'calculate_sla_deadline'
  )
ORDER BY routine_name;

-- 4. Check RLS is enabled on sensitive tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'user_roles', 'user_credits', 'user_subscriptions',
    'saved_skits', 'skit_budget', 'skit_ratings',
    'collections', 'user_activity', 'notifications',
    'saved_hooks', 'brands', 'b_roll_library',
    'reference_images', 'generated_images'
  )
ORDER BY tablename;

-- 5. Check subscription plans are seeded
SELECT id, name, credits_per_month, price_monthly
FROM subscription_plans
ORDER BY sort_order;
