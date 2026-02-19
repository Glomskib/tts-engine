import type { TaskStatus, RiskTier } from '@/lib/command-center/types';

// ── Status column config ──────────────────────────────────────
export interface StatusConfig {
  dbValue: TaskStatus;
  label: string;
  bgClass: string;
  textClass: string;
  dotClass: string;
}

export const STATUS_COLUMNS: StatusConfig[] = [
  {
    dbValue: 'queued',
    label: 'Assigned',
    bgClass: 'bg-teal-900/40',
    textClass: 'text-teal-400',
    dotClass: 'bg-teal-400',
  },
  {
    dbValue: 'active',
    label: 'Working On',
    bgClass: 'bg-amber-900/40',
    textClass: 'text-amber-400',
    dotClass: 'bg-amber-400',
  },
  {
    dbValue: 'blocked',
    label: 'Stuck',
    bgClass: 'bg-red-900/40',
    textClass: 'text-red-400',
    dotClass: 'bg-red-400',
  },
  {
    dbValue: 'done',
    label: 'Done',
    bgClass: 'bg-green-900/40',
    textClass: 'text-green-400',
    dotClass: 'bg-green-400',
  },
];

export const STATUS_MAP: Record<string, StatusConfig> = Object.fromEntries(
  STATUS_COLUMNS.map((c) => [c.dbValue, c]),
);

// killed is special — shown greyed in Done column on board, visible in table
export const KILLED_CONFIG: StatusConfig = {
  dbValue: 'killed',
  label: 'Killed',
  bgClass: 'bg-zinc-800/40',
  textClass: 'text-zinc-500',
  dotClass: 'bg-zinc-500',
};

export function getStatusConfig(status: string): StatusConfig {
  return STATUS_MAP[status] ?? KILLED_CONFIG;
}

// ── Priority config ───────────────────────────────────────────
export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Medium',
  4: 'Low',
  5: 'Nice-to-have',
};

export const PRIORITY_COLORS: Record<number, string> = {
  1: 'text-red-400',
  2: 'text-orange-400',
  3: 'text-yellow-400',
  4: 'text-blue-400',
  5: 'text-zinc-400',
};

// ── Risk tier config ──────────────────────────────────────────
export const RISK_BADGE: Record<RiskTier, { label: string; className: string }> = {
  low: { label: 'Low', className: 'text-green-400/70' },
  medium: { label: 'Med', className: 'text-yellow-400/70' },
  high: { label: 'High', className: 'text-red-400/70' },
};

// ── Task type with joined project name ────────────────────────
export interface TaskWithProject {
  id: string;
  project_id: string;
  title: string;
  description: string;
  assigned_agent: string;
  status: string;
  priority: number;
  risk_tier: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  due_at: string | null;
  meta: Record<string, unknown>;
  cc_projects?: { name: string } | null;
}

// ── Agent list ────────────────────────────────────────────────
export const AGENTS = [
  'bolt',
  'tom-dev',
  'dan-ops',
  'brett-growth',
  'christof-cfo',
  'susan-social',
  'greg-uploader',
  'human',
] as const;
