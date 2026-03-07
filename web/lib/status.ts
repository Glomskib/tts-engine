/**
 * Centralized recording status configuration.
 * Single source of truth for status labels, colors, and display properties.
 *
 * Usage:
 *   import { getStatusConfig, formatStatusLabel, RECORDING_STATUSES } from '@/lib/status';
 *   const cfg = getStatusConfig('NEEDS_SCRIPT');
 *   // cfg.label, cfg.bg, cfg.text, cfg.dot, cfg.emoji
 */

export type RecordingStatus =
  | 'NEEDS_SCRIPT'
  | 'GENERATING_SCRIPT'
  | 'NOT_RECORDED'
  | 'AI_RENDERING'
  | 'READY_FOR_REVIEW'
  | 'RECORDED'
  | 'EDITED'
  | 'APPROVED_NEEDS_EDITS'
  | 'READY_TO_POST'
  | 'POSTED'
  | 'REJECTED';

export type SlaStatus = 'on_track' | 'due_soon' | 'overdue' | 'no_due_date';

export interface StatusConfig {
  /** Human-readable label */
  label: string;
  /** Tailwind bg class, e.g. 'bg-red-500/10' */
  bg: string;
  /** Tailwind text class, e.g. 'text-red-400' */
  text: string;
  /** Tailwind bg class for the dot indicator */
  dot: string;
  /** Emoji for board headers */
  emoji: string;
  /** Combined bg + border for board column headers */
  boardBg: string;
}

/** All recording statuses in pipeline order */
export const RECORDING_STATUSES: RecordingStatus[] = [
  'NEEDS_SCRIPT',
  'GENERATING_SCRIPT',
  'NOT_RECORDED',
  'AI_RENDERING',
  'READY_FOR_REVIEW',
  'RECORDED',
  'EDITED',
  'APPROVED_NEEDS_EDITS',
  'READY_TO_POST',
  'POSTED',
  'REJECTED',
];

const STATUS_CONFIG: Record<RecordingStatus, StatusConfig> = {
  NEEDS_SCRIPT:         { label: 'Needs Script',      bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400',     emoji: '📝', boardBg: 'bg-red-500/10 border-red-500/20' },
  GENERATING_SCRIPT:    { label: 'Generating',         bg: 'bg-violet-500/10',  text: 'text-violet-400',  dot: 'bg-violet-400',  emoji: '🤖', boardBg: 'bg-violet-500/10 border-violet-500/20' },
  NOT_RECORDED:         { label: 'Scripted',           bg: 'bg-zinc-500/10',    text: 'text-zinc-400',    dot: 'bg-zinc-400',    emoji: '📄', boardBg: 'bg-zinc-500/10 border-zinc-500/20' },
  AI_RENDERING:         { label: 'AI Rendering',       bg: 'bg-purple-500/10',  text: 'text-purple-400',  dot: 'bg-purple-400',  emoji: '🎬', boardBg: 'bg-purple-500/10 border-purple-500/20' },
  READY_FOR_REVIEW:     { label: 'Ready for Review',   bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', emoji: '👀', boardBg: 'bg-emerald-500/10 border-emerald-500/20' },
  RECORDED:             { label: 'Recorded',           bg: 'bg-blue-500/10',    text: 'text-blue-400',    dot: 'bg-blue-400',    emoji: '🎙️', boardBg: 'bg-blue-500/10 border-blue-500/20' },
  EDITED:               { label: 'Edited',             bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  dot: 'bg-yellow-400',  emoji: '✂️', boardBg: 'bg-yellow-500/10 border-yellow-500/20' },
  APPROVED_NEEDS_EDITS: { label: 'Needs Edits',        bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-400',   emoji: '✂️', boardBg: 'bg-amber-500/10 border-amber-500/20' },
  READY_TO_POST:        { label: 'Ready to Post',      bg: 'bg-teal-500/10',    text: 'text-teal-400',    dot: 'bg-teal-400',    emoji: '✅', boardBg: 'bg-teal-500/10 border-teal-500/20' },
  POSTED:               { label: 'Posted',             bg: 'bg-green-500/10',   text: 'text-green-400',   dot: 'bg-green-400',   emoji: '🟢', boardBg: 'bg-green-500/10 border-green-500/20' },
  REJECTED:             { label: 'Rejected',           bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400',     emoji: '❌', boardBg: 'bg-red-500/10 border-red-500/20' },
};

const DEFAULT_CONFIG: StatusConfig = {
  label: 'Unknown',
  bg: 'bg-zinc-500/10',
  text: 'text-zinc-400',
  dot: 'bg-zinc-400',
  emoji: '❓',
  boardBg: 'bg-zinc-500/10 border-zinc-500/20',
};

/** Get the full status config for a recording status string. */
export function getStatusConfig(status: string | null | undefined): StatusConfig {
  if (!status) return DEFAULT_CONFIG;
  return STATUS_CONFIG[status as RecordingStatus] ?? DEFAULT_CONFIG;
}

/** Format a status key into a human-readable label. */
export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  const cfg = STATUS_CONFIG[status as RecordingStatus];
  if (cfg) return cfg.label;
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** SLA status styling (Tailwind classes, dark-theme) */
export function getSlaStatusConfig(sla: SlaStatus): { bg: string; text: string; border: string } {
  switch (sla) {
    case 'overdue':     return { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/20' };
    case 'due_soon':    return { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/20' };
    case 'on_track':    return { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20' };
    case 'no_due_date': return { bg: 'bg-zinc-500/10',   text: 'text-zinc-400',   border: 'border-zinc-500/20' };
    default:            return { bg: 'bg-zinc-500/10',   text: 'text-zinc-400',   border: 'border-zinc-500/20' };
  }
}
