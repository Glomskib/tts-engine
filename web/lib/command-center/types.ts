/**
 * Command Center – shared TypeScript types for all tables.
 *
 * These mirror the SQL schema in 20260218_command_center.sql.
 * "cc_projects" in Postgres is typed as CcProject here to avoid
 * collision with any existing Project type.
 */

// ── Usage ──────────────────────────────────────────────────────
export interface UsageEvent {
  id: string;
  ts: string; // ISO timestamptz
  provider: string;
  model: string;
  agent_id: string;
  project_id: string | null;
  request_type: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number | null;
  status: string;
  error_code: string | null;
  meta: Record<string, unknown>;
}

export interface UsageDailyRollup {
  day: string; // date string YYYY-MM-DD
  provider: string;
  model: string;
  agent_id: string;
  project_id: string | null;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  errors: number;
}

// ── Projects ───────────────────────────────────────────────────
export type CcProjectType = 'flashflow' | 'ttshop' | 'zebby' | 'hhh' | 'other';
export type CcProjectStatus = 'active' | 'paused' | 'archived';

export interface CcProject {
  id: string;
  name: string;
  type: CcProjectType;
  status: CcProjectStatus;
  owner: string | null;
  initiative_id: string | null;
  created_at: string;
}

// ── Tasks ──────────────────────────────────────────────────────
export type TaskStatus = 'queued' | 'active' | 'blocked' | 'done' | 'killed';

export type RiskTier = 'low' | 'medium' | 'high';

export interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  description: string;
  assigned_agent: string;
  status: TaskStatus;
  priority: number;
  risk_tier: RiskTier;
  sort_order: number;
  created_at: string;
  updated_at: string;
  due_at: string | null;
  meta: Record<string, unknown>;
}

export type TaskEventType =
  | 'created'
  | 'claimed'
  | 'updated'
  | 'comment'
  | 'status_change'
  | 'output_link';

export interface TaskEvent {
  id: string;
  task_id: string;
  ts: string;
  agent_id: string;
  event_type: TaskEventType;
  payload: Record<string, unknown>;
}

// ── Ideas ──────────────────────────────────────────────────────
export type IdeaStatus = 'queued' | 'researched' | 'building' | 'shipped' | 'killed';
export type IdeaMode = 'research_only' | 'research_and_plan' | 'research_and_build';

export interface Idea {
  id: string;
  created_at: string;
  created_by: string | null;
  title: string;
  prompt: string;
  tags: string[];
  status: IdeaStatus;
  mode: IdeaMode;
  priority: number;
  last_processed_at: string | null;
  meta: Record<string, unknown>;
}

export type ArtifactType = 'summary' | 'research' | 'links' | 'plan' | 'patch' | 'decision';

export interface IdeaArtifact {
  id: string;
  idea_id: string;
  ts: string;
  artifact_type: ArtifactType;
  content_md: string;
  meta: Record<string, unknown>;
}

// ── Initiatives ───────────────────────────────────────────────
export interface Initiative {
  id: string;
  slug: string | null;
  title: string;
  type: string;
  status: string;
  owner_email: string | null;
  created_at: string;
  updated_at: string;
}

// ── Finance ────────────────────────────────────────────────────
export type AccountType = 'bank' | 'credit' | 'stripe' | 'shopify' | 'other';
export type TxDirection = 'in' | 'out';
export type TxSource = 'manual' | 'stripe' | 'shopify' | 'tiktok' | 'bank_csv';

export interface FinanceAccount {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  created_at: string;
}

export interface FinanceTransaction {
  id: string;
  ts: string;
  account_id: string;
  direction: TxDirection;
  amount: number;
  category: string;
  vendor: string | null;
  memo: string | null;
  project_id: string | null;
  initiative_id: string | null;
  source: TxSource;
  meta: Record<string, unknown>;
}

// ── Profit ─────────────────────────────────────────────────────
export interface ProfitSummary {
  from: string;
  to: string;
  total_revenue_cents: number;
  total_expense_cents: number;
  total_profit_cents: number;
  daily_series: {
    day: string;
    revenue_cents: number;
    expense_cents: number;
    profit_cents: number;
  }[];
  top_revenue_categories: { category: string; amount_cents: number }[];
  top_expense_categories: { category: string; amount_cents: number }[];
}

// ── Dashboard summary types ────────────────────────────────────
export interface SpendSummary {
  today: number;
  week: number;
  month: number;
}

export interface RequestSummary {
  today: number;
  week: number;
}

export interface DashboardStats {
  spend: SpendSummary;
  requests: RequestSummary;
  errors_today: number;
  active_tasks: number;
  blocked_tasks: number;
  ideas_queued: number;
  ideas_researched_24h: number;
}

export interface FinanceSummary {
  total_in: number;
  total_out: number;
  net: number;
  by_category: Record<string, { in: number; out: number }>;
  by_project: Record<string, { in: number; out: number; project_name: string }>;
}
