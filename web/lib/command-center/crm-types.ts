/**
 * CRM Pipeline – shared TypeScript types.
 * Mirrors the SQL schema in 20260225000001_crm_pipeline.sql.
 */

// ── Pipeline ──────────────────────────────────────────────────
export interface PipelineStage {
  key: string;
  label: string;
  color: string;
  position: number;
}

export interface CrmPipeline {
  id: string;
  slug: string;
  name: string;
  stages: PipelineStage[];
  initiative_id: string | null;
  is_preset: boolean;
  created_at: string;
  updated_at: string;
}

// ── Contact ───────────────────────────────────────────────────
export interface CrmContact {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  source: string;
  notes: string;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Deal ──────────────────────────────────────────────────────
export interface CrmDeal {
  id: string;
  pipeline_id: string;
  contact_id: string | null;
  title: string;
  stage_key: string;
  value_cents: number;
  probability: number;
  sort_order: number;
  stage_entered_at: string;
  notes: string;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DealWithContact extends CrmDeal {
  crm_contacts: { id: string; name: string; email: string | null; company: string | null } | null;
}

// ── Activity ──────────────────────────────────────────────────
export type CrmActivityType =
  | 'email_in'
  | 'email_out'
  | 'call'
  | 'note'
  | 'stage_change'
  | 'meeting'
  | 'task';

export interface CrmActivity {
  id: string;
  deal_id: string | null;
  contact_id: string | null;
  activity_type: CrmActivityType;
  subject: string;
  body: string;
  source_id: string | null;
  actor: string;
  meta: Record<string, unknown>;
  ts: string;
}

// ── Analytics ─────────────────────────────────────────────────
export interface StageAnalytics {
  key: string;
  label: string;
  color: string;
  deal_count: number;
  total_value_cents: number;
  avg_days_in_stage: number;
}

export interface PipelineAnalytics {
  pipeline_id: string;
  pipeline_name: string;
  stages: StageAnalytics[];
  conversion_rates: { from: string; to: string; rate: number }[];
  total_value_cents: number;
  weighted_value_cents: number;
  total_deals: number;
}
