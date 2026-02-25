// ============================================================
// Editing Marketplace Types
// ============================================================

import {
  MP_PLAN_CONFIGS,
  mpPlanLabel,
  type MpPlanTier,
  type MpPlanConfig,
  type MpPlanStatus,
} from './plan-config';

export type MpRole = 'client_owner' | 'client_member' | 'va_editor' | 'admin';
export type MemberRole = 'owner' | 'member';
export type VaRateMode = 'per_video' | 'base_plus_bonus';

// Re-export plan tier type & config from the canonical source
export type PlanTier = MpPlanTier;
export type { MpPlanConfig, MpPlanStatus };

// ---------- Plan tier configuration ----------
// Legacy alias — new code should import from plan-config.ts directly.

export interface PlanTierConfig {
  label: string;
  daily_cap: number;
  sla_hours: number;
  priority_weight: number;
}

export const PLAN_TIER_DEFAULTS: Record<PlanTier, PlanTierConfig> = Object.fromEntries(
  Object.entries(MP_PLAN_CONFIGS).map(([k, v]) => [k, {
    label: v.label,
    daily_cap: v.daily_cap,
    sla_hours: v.sla_hours,
    priority_weight: v.priority_weight,
  }])
) as Record<PlanTier, PlanTierConfig>;

/** Get the plan tier label for display (safe for VA view) */
export function planTierLabel(tier: PlanTier): string {
  return mpPlanLabel(tier);
}

/** Compute due_at from now + sla_hours */
export function computeDueAt(slaHours: number): string {
  return new Date(Date.now() + slaHours * 3_600_000).toISOString();
}

/**
 * Get "today" date string in a client's timezone (YYYY-MM-DD).
 * Falls back to UTC if timezone is invalid.
 */
export function getClientToday(timezone: string | null): string {
  try {
    const tz = timezone || 'UTC';
    const now = new Date();
    // Intl.DateTimeFormat gives us the date parts in the target timezone
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return parts; // en-CA gives YYYY-MM-DD format
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Compute SLA metadata for API responses */
export function computeSlaFields(dueAt: string | null): { is_overdue: boolean; due_in_hours: number | null } {
  if (!dueAt) return { is_overdue: false, due_in_hours: null };
  const diff = new Date(dueAt).getTime() - Date.now();
  return {
    is_overdue: diff < 0,
    due_in_hours: Math.round(diff / 3_600_000),
  };
}

export type ScriptStatus =
  | 'draft' | 'ready_to_record' | 'recorded' | 'queued' | 'editing'
  | 'in_review' | 'changes_requested' | 'approved' | 'posted'
  | 'blocked' | 'error' | 'archived';

export type AssetType =
  | 'raw_folder' | 'raw_video' | 'edited_video' | 'reference'
  | 'broll_ai' | 'broll_stock' | 'broll_reference';

export type JobStatus =
  | 'queued' | 'claimed' | 'in_progress' | 'submitted'
  | 'changes_requested' | 'approved' | 'posted'
  | 'blocked' | 'error' | 'canceled';

export type FeedbackRole = 'client' | 'va' | 'admin';
export type DeliverableType = 'main' | 'variant';
export type BrollSourceType = 'ai' | 'stock' | 'reference';

export type JobEventType =
  | 'created' | 'recorded' | 'queued' | 'claimed' | 'started'
  | 'submitted' | 'changes_requested' | 'approved' | 'posted'
  | 'blocked' | 'error' | 'retried' | 'canceled';

// ---------- Row types ----------

export interface MpProfile {
  id: string;
  email: string;
  display_name: string | null;
  role: MpRole;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  client_code: string;
  owner_user_id: string;
  timezone: string;
  created_at: string;
}

export interface ClientMembership {
  id: string;
  client_id: string;
  user_id: string;
  member_role: MemberRole;
}

export interface VaProfile {
  user_id: string;
  languages: string[];
  rate_mode: VaRateMode;
  active: boolean;
  created_at: string;
}

export interface ClientPlan {
  client_id: string;
  plan_tier: PlanTier;
  daily_cap: number;
  monthly_cap: number | null;
  sla_hours: number;
  allow_variants: boolean;
  dedicated_editor_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanUsageDaily {
  client_id: string;
  date: string;
  submitted_count: number;
  recorded_count: number;
  edited_count: number;
}

export interface MpScript {
  id: string;
  client_id: string;
  title: string;
  script_text: string | null;
  notes: string | null;
  broll_suggestions: string | null;
  references: unknown[];
  keep_verbatim: string | null;
  variation_map: Record<string, unknown>;
  status: ScriptStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScriptAsset {
  id: string;
  script_id: string;
  asset_type: AssetType;
  label: string | null;
  url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EditJob {
  id: string;
  script_id: string;
  client_id: string;
  job_status: JobStatus;
  priority: number;
  claimed_by: string | null;
  claimed_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  posted_at: string | null;
  due_at: string | null;
  blocked_reason: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobFeedback {
  id: string;
  job_id: string;
  author_user_id: string;
  author_role: FeedbackRole;
  message: string;
  created_at: string;
}

export interface JobDeliverable {
  id: string;
  job_id: string;
  deliverable_type: DeliverableType;
  label: string | null;
  url: string;
  created_by: string | null;
  created_at: string;
}

export interface JobEvent {
  id: string;
  job_id: string;
  event_type: JobEventType;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface BrollAsset {
  id: string;
  hash: string;
  source_type: BrollSourceType;
  client_code: string;
  script_id: string | null;
  storage_bucket: string;
  storage_path: string;
  local_cached: boolean;
  local_path: string | null;
  duration_seconds: number | null;
  tags: string[];
  prompt: string | null;
  created_at: string;
}

export interface ScriptBrollLink {
  script_id: string;
  broll_asset_id: string;
  recommended_for: string | null;
  notes: string | null;
  created_at: string;
}

// ---------- Composite / View types ----------

export interface ScriptWithJob extends MpScript {
  edit_job: EditJob | null;
  assets: ScriptAsset[];
}

export interface JobWithScript extends EditJob {
  script: MpScript;
  client_code: string;
  plan_tier: string;
  sla_hours: number;
  is_overdue: boolean;
  due_in_hours: number | null;
  assets: ScriptAsset[];
  deliverables: JobDeliverable[];
  feedback: JobFeedback[];
  events: JobEvent[];
  broll_links: (ScriptBrollLink & { asset: BrollAsset; signed_url: string | null })[];
}

export interface PipelineRow {
  id: string;
  title: string;
  status: ScriptStatus;
  job_status: JobStatus | null;
  created_at: string;
  updated_at: string;
  has_raw_footage: boolean;
  has_deliverable: boolean;
  assigned_editor: string | null;
  due_at: string | null;
  next_action: string;
}

export interface MetricsSummary {
  avg_turnaround_7d: number | null;
  avg_turnaround_30d: number | null;
  on_time_rate_7d: number | null;
  on_time_rate_30d: number | null;
  queue_count: number;
  in_progress_count: number;
  completed_7d: number;
  completed_30d: number;
  avg_queue_wait_hours: number | null;
  avg_edit_time_hours: number | null;
  avg_review_time_hours: number | null;
  oldest_in_queue_hours: number | null;
}

// ---------- Status display ----------

export const SCRIPT_STATUS_LABELS: Record<ScriptStatus, string> = {
  draft: 'Draft',
  ready_to_record: 'Ready to Record',
  recorded: 'Recorded',
  queued: 'Queued for Edit',
  editing: 'Editing',
  in_review: 'In Review',
  changes_requested: 'Changes Requested',
  approved: 'Approved',
  posted: 'Posted',
  blocked: 'Blocked',
  error: 'Error',
  archived: 'Archived',
};

export const SCRIPT_STATUS_COLORS: Record<ScriptStatus, string> = {
  draft: 'bg-zinc-700 text-zinc-300',
  ready_to_record: 'bg-amber-900/60 text-amber-300',
  recorded: 'bg-blue-900/60 text-blue-300',
  queued: 'bg-purple-900/60 text-purple-300',
  editing: 'bg-indigo-900/60 text-indigo-300',
  in_review: 'bg-orange-900/60 text-orange-300',
  changes_requested: 'bg-yellow-900/60 text-yellow-300',
  approved: 'bg-green-900/60 text-green-300',
  posted: 'bg-teal-900/60 text-teal-300',
  blocked: 'bg-red-900/60 text-red-300',
  error: 'bg-red-900/80 text-red-200',
  archived: 'bg-zinc-800 text-zinc-500',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'Queued',
  claimed: 'Claimed',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  changes_requested: 'Changes Requested',
  approved: 'Approved',
  posted: 'Posted',
  blocked: 'Blocked',
  error: 'Error',
  canceled: 'Canceled',
};

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  queued: 'bg-purple-900/60 text-purple-300',
  claimed: 'bg-blue-900/60 text-blue-300',
  in_progress: 'bg-indigo-900/60 text-indigo-300',
  submitted: 'bg-orange-900/60 text-orange-300',
  changes_requested: 'bg-yellow-900/60 text-yellow-300',
  approved: 'bg-green-900/60 text-green-300',
  posted: 'bg-teal-900/60 text-teal-300',
  blocked: 'bg-red-900/60 text-red-300',
  error: 'bg-red-900/80 text-red-200',
  canceled: 'bg-zinc-700 text-zinc-400',
};

/** Determine the primary "Next Action" label for a script row */
export function getNextAction(status: ScriptStatus, jobStatus: JobStatus | null): string {
  switch (status) {
    case 'draft': return 'Edit Script';
    case 'ready_to_record': return 'Mark Recorded';
    case 'recorded': return 'Queue for Edit';
    case 'queued': return 'Awaiting Editor';
    case 'editing': return 'Editing...';
    case 'in_review': return 'Review';
    case 'changes_requested': return jobStatus === 'changes_requested' ? 'Awaiting Revision' : 'Review';
    case 'approved': return 'Mark Posted';
    case 'posted': return 'Done';
    case 'blocked': return 'Unblock';
    case 'error': return 'Retry';
    case 'archived': return 'Archived';
  }
}

/** Compute age string from ISO date */
export function ageString(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
