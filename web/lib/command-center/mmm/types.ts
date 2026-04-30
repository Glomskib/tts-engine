/**
 * MMM Command Center — local types.
 *
 * Built on top of the existing Command Center primitives (initiatives, cc_projects,
 * project_tasks, agent_runs, finance_transactions, marketing_posts, ideas).
 * No new tables — everything below is either a TS-side overlay or a static registry.
 *
 * White-label-ready: every entity carries `group_slug` so a second org could be
 * dropped in by changing the registry, not the schema.
 */

export type GroupSlug = 'making-miles-matter' | string;
export type EventStatus = 'upcoming' | 'in-progress' | 'completed' | 'cancelled';
export type Source = 'human' | 'agent';
export type ApprovalState = 'not-needed' | 'pending' | 'approved' | 'rejected';

export interface MmmTeamMember {
  id: string;
  name: string;
  role: 'director' | 'logistics' | 'helper' | 'volunteer-lead' | 'finance' | 'ops';
  email?: string;
  group_slug: GroupSlug;
  notes?: string;
  is_owner?: boolean;
}

export interface MmmAgent {
  id: string;
  name: string;
  identity: string;
  group_slug: GroupSlug;
  description: string;
  capabilities: string[];
  default_owner_email?: string;
}

export interface MmmEvent {
  slug: string;
  initiative_slug: string;
  group_slug: GroupSlug;
  name: string;
  short_name: string;
  status: EventStatus;
  date_iso: string;
  display_date: string;
  start_time?: string;
  location?: string;
  registration_goal?: number;
  registrations?: number;
  sponsor_goal?: number;
  sponsors_secured?: number;
  description?: string;
  highlights?: string[];
  notes?: string;
}

export interface MmmFinancialLine {
  label: string;
  category: 'revenue' | 'expense' | 'sponsorship' | 'donation' | 'projected';
  amount_cents: number;
  source_note: string;
  is_demo: boolean;
}

export interface MmmFinancialSummary {
  event_slug: string;
  display_date: string;
  status: EventStatus;
  lines: MmmFinancialLine[];
  totals: {
    revenue_cents: number;
    expense_cents: number;
    net_cents: number;
    sponsorship_cents: number;
    donations_cents: number;
  };
  outstanding_targets: { label: string; remaining_cents: number; note: string }[];
  is_demo: boolean;
}

export interface MmmMeetingNote {
  slug: string;
  group_slug: GroupSlug;
  title: string;
  date_iso: string;
  attendees: string[];
  decisions: string[];
  action_items: string[];
  body_md: string;
  source_path: string;
}

export interface MmmResearchItem {
  id: string;
  group_slug: GroupSlug;
  title: string;
  status: 'queued' | 'researching' | 'researched' | 'archived';
  event_name?: string;
  location?: string;
  date_or_season?: string;
  registration_model?: string;
  sponsor_ideas?: string[];
  attendance_clue?: string;
  takeaways?: string[];
  source: Source;
  approval_state: ApprovalState;
  tags: string[];
  underlying_idea_id?: string;
}

export interface MmmAgentActivity {
  id: string;
  agent_id: string;
  group_slug: GroupSlug;
  kind: 'suggested-task' | 'social-draft' | 'meeting-summary' | 'research-note' | 'weekly-report' | 'recap';
  title: string;
  summary: string;
  body_md?: string;
  related_event_slug?: string;
  approval_state: ApprovalState;
  source: Source;
  is_demo: boolean;
  created_at: string;
}

export interface MmmTaskOwnerGroup {
  owner_id: string;
  owner_label: string;
  team_member?: MmmTeamMember;
  agent?: MmmAgent;
  tasks: MmmTaskRow[];
}

export interface MmmTaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  risk_tier: string;
  assigned_agent: string;
  due_at: string | null;
  initiative_slug: string | null;
  initiative_title: string | null;
  project_name: string | null;
  source: Source;
  approval_state: ApprovalState;
}

export interface MmmSocialPost {
  id: string;
  scheduled_for: string | null;
  status: string;
  platforms: string[];
  content: string;
  tags: string[];
  source: Source;
  approval_state: ApprovalState;
  is_demo: boolean;
}

export interface MmmReadinessCategory {
  key: string;
  label: string;
  status: 'not-started' | 'needs-attention' | 'on-track' | 'done';
  owner_id?: string;
  owner_label?: string;
  due_label?: string;
  task_total: number;
  task_done: number;
  task_blocked: number;
  next_action?: string;
  blockers?: string[];
}

export interface MmmReadinessSummary {
  event_slug: string;
  event_label: string;
  status_label: string;
  on_track: number;
  needs_attention: number;
  not_started: number;
  done: number;
  total: number;
  ready_pct: number;
  categories: MmmReadinessCategory[];
}

export interface MmmSponsorDeal {
  id: string;
  title: string;
  stage_key: string;
  stage_label: string;
  stage_color: string;
  value_cents: number | null;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  is_demo: boolean;
  declined: boolean;
  stage_entered_at: string | null;
  last_activity_at: string | null;
}

export interface MmmSponsorPipeline {
  pipeline_id: string | null;
  pipeline_slug: string;
  pipeline_name: string;
  stages: { key: string; label: string; color: string; position: number }[];
  deals: MmmSponsorDeal[];
  goal: number;
  committed_count: number;
  paid_count: number;
  unpaid_committed_count: number;
  total_committed_cents: number;
  total_paid_cents: number;
  next_followups: { id: string; title: string; stage_label: string; due_in_days?: number | null }[];
  recent_activities: {
    id: string;
    deal_id: string | null;
    activity_type: string;
    subject: string | null;
    body: string | null;
    ts: string;
  }[];
}

// Re-export approval type so dashboard pages don't need to know the import path.
import type { ApprovalItem } from './approvals';
export type { ApprovalItem };

export interface MmmDashboardData {
  group_slug: GroupSlug;
  group_label: string;
  fetched_at: string;
  events: MmmEvent[];
  team: MmmTeamMember[];
  agents: MmmAgent[];
  task_groups: MmmTaskOwnerGroup[];
  task_total: number;
  social_posts: MmmSocialPost[];
  finance: MmmFinancialSummary[];
  meeting_notes: MmmMeetingNote[];
  research: MmmResearchItem[];
  agent_activity: MmmAgentActivity[];
  pending_approvals: ApprovalItem[];
  readiness: MmmReadinessSummary;
  sponsors: MmmSponsorPipeline;
  next_actions: { label: string; owner_id?: string; due_label?: string; tone?: 'urgent' | 'normal' }[];
  warnings: string[];
}
