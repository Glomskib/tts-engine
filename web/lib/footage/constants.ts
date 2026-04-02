/**
 * FlashFlow Footage Hub — Shared Constants
 *
 * Single source of truth for all footage lifecycle stages, labels, colors,
 * and allowed transitions. Import from here everywhere — never redefine.
 */

// ─── Stage Enum ───────────────────────────────────────────────────────────────

export const FOOTAGE_STAGES = [
  'raw_uploaded',
  'preprocessing',
  'ready_for_edit',
  'auto_edit_queued',
  'auto_edit_processing',
  'auto_edit_complete',
  'needs_review',
  'approved',
  'draft_ready',
  'posted',
  'failed',
  'archived',
] as const;

export type FootageStage = typeof FOOTAGE_STAGES[number];

// ─── Stage Labels (display text) ──────────────────────────────────────────────

export const FOOTAGE_STAGE_LABELS: Record<FootageStage, string> = {
  raw_uploaded:          'Raw Upload',
  preprocessing:         'Processing',
  ready_for_edit:        'Ready to Edit',
  auto_edit_queued:      'Edit Queued',
  auto_edit_processing:  'Editing...',
  auto_edit_complete:    'Edit Complete',
  needs_review:          'Needs Review',
  approved:              'Approved',
  draft_ready:           'Draft Ready',
  posted:                'Posted',
  failed:                'Failed',
  archived:              'Archived',
};

// ─── Stage Colors (Tailwind classes) ─────────────────────────────────────────

export const FOOTAGE_STAGE_COLORS: Record<FootageStage, { bg: string; text: string; border: string; dot: string }> = {
  raw_uploaded:          { bg: 'bg-zinc-800',        text: 'text-zinc-300',   border: 'border-zinc-700',      dot: 'bg-zinc-500'    },
  preprocessing:         { bg: 'bg-blue-900/40',     text: 'text-blue-300',   border: 'border-blue-700/40',   dot: 'bg-blue-400'    },
  ready_for_edit:        { bg: 'bg-indigo-900/40',   text: 'text-indigo-300', border: 'border-indigo-700/40', dot: 'bg-indigo-400'  },
  auto_edit_queued:      { bg: 'bg-violet-900/40',   text: 'text-violet-300', border: 'border-violet-700/40', dot: 'bg-violet-400'  },
  auto_edit_processing:  { bg: 'bg-teal-900/40',     text: 'text-teal-300',   border: 'border-teal-700/40',   dot: 'bg-teal-400'    },
  auto_edit_complete:    { bg: 'bg-cyan-900/40',     text: 'text-cyan-300',   border: 'border-cyan-700/40',   dot: 'bg-cyan-400'    },
  needs_review:          { bg: 'bg-yellow-900/40',   text: 'text-yellow-300', border: 'border-yellow-700/40', dot: 'bg-yellow-400'  },
  approved:              { bg: 'bg-green-900/40',    text: 'text-green-300',  border: 'border-green-700/40',  dot: 'bg-green-400'   },
  draft_ready:           { bg: 'bg-emerald-900/40',  text: 'text-emerald-300',border: 'border-emerald-700/40',dot: 'bg-emerald-400' },
  posted:                { bg: 'bg-pink-900/40',     text: 'text-pink-300',   border: 'border-pink-700/40',   dot: 'bg-pink-400'    },
  failed:                { bg: 'bg-red-900/40',      text: 'text-red-300',    border: 'border-red-700/40',    dot: 'bg-red-400'     },
  archived:              { bg: 'bg-zinc-900/40',     text: 'text-zinc-500',   border: 'border-zinc-800',      dot: 'bg-zinc-600'    },
};

// ─── Allowed Stage Transitions ────────────────────────────────────────────────

export const FOOTAGE_STAGE_TRANSITIONS: Record<FootageStage, FootageStage[]> = {
  raw_uploaded:          ['preprocessing', 'ready_for_edit', 'failed', 'archived'],
  preprocessing:         ['ready_for_edit', 'failed'],
  ready_for_edit:        ['auto_edit_queued', 'needs_review', 'approved', 'archived'],
  auto_edit_queued:      ['auto_edit_processing', 'ready_for_edit', 'failed'],
  auto_edit_processing:  ['auto_edit_complete', 'failed'],
  auto_edit_complete:    ['needs_review', 'approved', 'archived'],
  needs_review:          ['approved', 'ready_for_edit', 'archived'],
  approved:              ['draft_ready', 'needs_review', 'archived'],
  draft_ready:           ['posted', 'approved', 'archived'],
  posted:                ['archived'],
  failed:                ['raw_uploaded', 'archived'],  // allow requeue
  archived:              [],
};

export function canTransitionFootage(from: FootageStage, to: FootageStage): boolean {
  if (from === to) return true; // idempotent
  return FOOTAGE_STAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Source Types ─────────────────────────────────────────────────────────────

export const FOOTAGE_SOURCE_TYPES = [
  'clip_studio',
  'google_drive',
  'direct_upload',
  'ingestion',
  'render_output',
  'bot_upload',
] as const;

export type FootageSourceType = typeof FOOTAGE_SOURCE_TYPES[number];

export const FOOTAGE_SOURCE_LABELS: Record<FootageSourceType, string> = {
  clip_studio:    'Clip Studio',
  google_drive:   'Google Drive',
  direct_upload:  'Direct Upload',
  ingestion:      'Ingestion',
  render_output:  'Render Output',
  bot_upload:     'Bot Upload',
};

// ─── Uploaded By ──────────────────────────────────────────────────────────────

export const FOOTAGE_UPLOADED_BY = [
  'user',
  'miles_bot',
  'flash_bot',
  'admin',
  'system',
] as const;

export type FootageUploadedBy = typeof FOOTAGE_UPLOADED_BY[number];

export const FOOTAGE_UPLOADED_BY_LABELS: Record<FootageUploadedBy, string> = {
  user:       'User',
  miles_bot:  'Miles Bot',
  flash_bot:  'Flash Bot',
  admin:      'Admin',
  system:     'System',
};

// ─── Stage Groups (for UI filtering) ─────────────────────────────────────────

export const FOOTAGE_STAGE_GROUPS: Record<string, FootageStage[]> = {
  active:    ['raw_uploaded', 'preprocessing', 'ready_for_edit'],
  editing:   ['auto_edit_queued', 'auto_edit_processing', 'auto_edit_complete'],
  review:    ['needs_review', 'approved'],
  publishing:['draft_ready', 'posted'],
  terminal:  ['failed', 'archived'],
};

// ─── Active stages (not terminal) ────────────────────────────────────────────

export const ACTIVE_FOOTAGE_STAGES: FootageStage[] = [
  'raw_uploaded', 'preprocessing', 'ready_for_edit',
  'auto_edit_queued', 'auto_edit_processing', 'auto_edit_complete',
  'needs_review', 'approved', 'draft_ready',
];

// ─── Transcript statuses ──────────────────────────────────────────────────────

export const TRANSCRIPT_STATUSES = ['none', 'pending', 'processing', 'completed', 'failed'] as const;
export type TranscriptStatus = typeof TRANSCRIPT_STATUSES[number];
