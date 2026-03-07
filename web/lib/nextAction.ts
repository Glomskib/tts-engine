/**
 * Centralized Next Action engine for pipeline videos.
 * Determines the single recommended action for each video based on its
 * current recording status, script state, and permissions.
 *
 * This is the single source of truth — replaces getPrimaryAction in
 * pipeline/types.ts and pipeline/page.tsx.
 */

export type ActionKey =
  | 'attach_script'
  | 'record'
  | 'review'
  | 'edit'
  | 'approve'
  | 'post'
  | 'done'
  | 'rejected'
  | 're_generate';

export type ActionPriority = 'high' | 'medium' | 'low';

export interface NextAction {
  key: ActionKey;
  label: string;
  shortLabel: string;
  priority: ActionPriority;
  /** Tailwind bg/text classes for the action button */
  buttonClass: string;
  /** Hex color for contexts needing inline styles (e.g. VideoDrawer) */
  color: string;
  requiredRole: 'recorder' | 'editor' | 'uploader' | 'admin' | null;
  disabled: boolean;
  disabledReason?: string;
  actionType: 'modal' | 'transition' | 'none';
  targetStatus?: string;
}

export interface VideoForAction {
  recording_status: string | null;
  script_locked_text: string | null;
  script_not_required?: boolean | null;
  can_record: boolean;
  can_mark_edited: boolean;
  can_mark_ready_to_post: boolean;
  can_mark_posted: boolean;
  sla_status: string;
  blocked_reason: string | null;
}

function slaPriority(sla: string): ActionPriority {
  if (sla === 'overdue') return 'high';
  if (sla === 'due_soon') return 'high';
  return 'medium';
}

export function getNextAction(video: VideoForAction): NextAction {
  const status = video.recording_status || 'NOT_RECORDED';
  const hasScript = !!video.script_locked_text || !!video.script_not_required;
  const priority = slaPriority(video.sla_status);

  // Generating script — waiting state
  if (status === 'GENERATING_SCRIPT') {
    return {
      key: 'attach_script',
      label: 'Generating Script...',
      shortLabel: 'Generating',
      priority: 'low',
      buttonClass: 'bg-violet-600 text-white',
      color: '#7c3aed',
      requiredRole: null,
      disabled: true,
      disabledReason: 'Script is being generated',
      actionType: 'none',
    };
  }

  // AI Rendering — waiting state
  if (status === 'AI_RENDERING') {
    return {
      key: 'done',
      label: 'AI Rendering...',
      shortLabel: 'Rendering',
      priority: 'low',
      buttonClass: 'bg-purple-600 text-white',
      color: '#9333ea',
      requiredRole: null,
      disabled: true,
      disabledReason: 'Video is being rendered',
      actionType: 'none',
    };
  }

  // Needs script
  if (status === 'NEEDS_SCRIPT' || (!hasScript && status === 'NOT_RECORDED')) {
    return {
      key: 'attach_script',
      label: 'Attach Script',
      shortLabel: 'Script',
      priority,
      buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white',
      color: '#d97706',
      requiredRole: 'recorder',
      disabled: false,
      actionType: 'modal',
    };
  }

  // Ready to record
  if (status === 'NOT_RECORDED') {
    return {
      key: 'record',
      label: 'Record Video',
      shortLabel: 'Record',
      priority,
      buttonClass: 'bg-blue-600 hover:bg-blue-500 text-white',
      color: '#2563eb',
      requiredRole: 'recorder',
      disabled: !video.can_record,
      disabledReason: video.can_record ? undefined : 'Script required',
      actionType: 'transition',
      targetStatus: 'RECORDED',
    };
  }

  // Ready for review (AI-composed video)
  if (status === 'READY_FOR_REVIEW') {
    return {
      key: 'review',
      label: 'Review Video',
      shortLabel: 'Review',
      priority,
      buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      color: '#059669',
      requiredRole: 'admin',
      disabled: false,
      actionType: 'transition',
      targetStatus: 'READY_TO_POST',
    };
  }

  // Recorded — needs editing
  if (status === 'RECORDED') {
    return {
      key: 'edit',
      label: 'Start Editing',
      shortLabel: 'Edit',
      priority,
      buttonClass: 'bg-blue-600 hover:bg-blue-500 text-white',
      color: '#2563eb',
      requiredRole: 'editor',
      disabled: !video.can_mark_edited,
      disabledReason: video.can_mark_edited ? undefined : 'Recording required',
      actionType: 'transition',
      targetStatus: 'EDITED',
    };
  }

  // Edited — needs approval
  if (status === 'EDITED') {
    return {
      key: 'approve',
      label: 'Approve',
      shortLabel: 'Approve',
      priority,
      buttonClass: 'bg-teal-600 hover:bg-teal-500 text-white',
      color: '#0d9488',
      requiredRole: 'editor',
      disabled: !video.can_mark_ready_to_post,
      disabledReason: video.can_mark_ready_to_post ? undefined : 'Need video URL',
      actionType: 'transition',
      targetStatus: 'READY_TO_POST',
    };
  }

  // Approved but needs edits
  if (status === 'APPROVED_NEEDS_EDITS') {
    return {
      key: 'edit',
      label: 'Apply Edits',
      shortLabel: 'Edits',
      priority,
      buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white',
      color: '#d97706',
      requiredRole: 'editor',
      disabled: false,
      actionType: 'transition',
      targetStatus: 'READY_TO_POST',
    };
  }

  // Ready to post
  if (status === 'READY_TO_POST') {
    return {
      key: 'post',
      label: 'Post Video',
      shortLabel: 'Post',
      priority,
      buttonClass: 'bg-teal-600 hover:bg-teal-500 text-white',
      color: '#0d9488',
      requiredRole: 'uploader',
      disabled: false,
      actionType: 'modal',
    };
  }

  // Posted — complete
  if (status === 'POSTED') {
    return {
      key: 'done',
      label: 'Complete',
      shortLabel: 'Done',
      priority: 'low',
      buttonClass: 'bg-green-600/20 text-green-400',
      color: '#22c55e',
      requiredRole: null,
      disabled: true,
      actionType: 'none',
    };
  }

  // Rejected — re-generate
  if (status === 'REJECTED') {
    return {
      key: 're_generate',
      label: 'Re-generate',
      shortLabel: 'Redo',
      priority: 'high',
      buttonClass: 'bg-violet-600 hover:bg-violet-500 text-white',
      color: '#7c3aed',
      requiredRole: 'admin',
      disabled: false,
      actionType: 'transition',
      targetStatus: 'NOT_RECORDED',
    };
  }

  // Fallback
  return {
    key: 'done',
    label: 'View',
    shortLabel: 'View',
    priority: 'low',
    buttonClass: 'bg-zinc-700 text-zinc-300',
    color: '#71717a',
    requiredRole: null,
    disabled: false,
    actionType: 'none',
  };
}
