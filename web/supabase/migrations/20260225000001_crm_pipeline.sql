-- ============================================================
-- CRM Pipeline: Deal boards, contacts, activities
-- Migration: 20260225000001_crm_pipeline
-- Tables: crm_pipelines, crm_contacts, crm_deals, crm_activities
-- ============================================================

-- ============================================================
-- 1. crm_pipelines — pipeline definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  initiative_id uuid REFERENCES public.initiatives(id) ON DELETE SET NULL,
  is_preset boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_pipelines_slug ON public.crm_pipelines (slug);
CREATE INDEX IF NOT EXISTS idx_crm_pipelines_initiative ON public.crm_pipelines (initiative_id);

ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_pipelines_service_only" ON public.crm_pipelines;
CREATE POLICY "crm_pipelines_service_only" ON public.crm_pipelines
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 2. crm_contacts — people / companies
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  company text,
  phone text,
  source text NOT NULL DEFAULT 'manual',
  notes text NOT NULL DEFAULT '',
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_email
  ON public.crm_contacts (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON public.crm_contacts (company);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_source ON public.crm_contacts (source);

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_contacts_service_only" ON public.crm_contacts;
CREATE POLICY "crm_contacts_service_only" ON public.crm_contacts
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 3. crm_deals — deals in a pipeline stage
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  stage_key text NOT NULL,
  value_cents integer NOT NULL DEFAULT 0,
  probability integer NOT NULL DEFAULT 50,
  sort_order integer NOT NULL DEFAULT 0,
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL DEFAULT '',
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_pipeline ON public.crm_deals (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_contact ON public.crm_deals (contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON public.crm_deals (pipeline_id, stage_key);
CREATE INDEX IF NOT EXISTS idx_crm_deals_sort ON public.crm_deals (pipeline_id, stage_key, sort_order);

ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_deals_service_only" ON public.crm_deals;
CREATE POLICY "crm_deals_service_only" ON public.crm_deals
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 4. crm_activities — timeline entries
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  source_id text,
  actor text NOT NULL DEFAULT 'admin',
  meta jsonb DEFAULT '{}'::jsonb,
  ts timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_deal ON public.crm_activities (deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON public.crm_activities (contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON public.crm_activities (activity_type);
CREATE INDEX IF NOT EXISTS idx_crm_activities_ts ON public.crm_activities (ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_activities_source_id
  ON public.crm_activities (source_id) WHERE source_id IS NOT NULL;

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_activities_service_only" ON public.crm_activities;
CREATE POLICY "crm_activities_service_only" ON public.crm_activities
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- Seed: preset pipelines
-- ============================================================
INSERT INTO public.crm_pipelines (slug, name, stages, is_preset) VALUES
(
  'mmm-sponsors',
  'MMM Sponsors',
  '[
    {"key":"lead","label":"Lead","color":"#6366f1","position":0},
    {"key":"researched","label":"Researched","color":"#8b5cf6","position":1},
    {"key":"outreach-sent","label":"Outreach Sent","color":"#3b82f6","position":2},
    {"key":"follow-up","label":"Follow-up","color":"#f59e0b","position":3},
    {"key":"negotiation","label":"Negotiation","color":"#f97316","position":4},
    {"key":"confirmed","label":"Confirmed","color":"#22c55e","position":5},
    {"key":"fulfilled","label":"Fulfilled","color":"#10b981","position":6}
  ]'::jsonb,
  true
),
(
  'flashflow-sales',
  'FlashFlow Sales',
  '[
    {"key":"lead","label":"Lead","color":"#6366f1","position":0},
    {"key":"demo","label":"Demo","color":"#3b82f6","position":1},
    {"key":"trial","label":"Trial","color":"#f59e0b","position":2},
    {"key":"converted","label":"Converted","color":"#22c55e","position":3},
    {"key":"retained","label":"Retained","color":"#10b981","position":4}
  ]'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;
