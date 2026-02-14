/**
 * Execution stage validation and helpers
 * Used by both execution route (server-side validation) and queue route (computed fields)
 */

import type { ApiErrorCode } from './api-errors';

export const RECORDING_STATUSES = [
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
] as const;

/**
 * SLA deadlines in minutes for each recording status
 * These define how long a video should stay in each stage before becoming overdue
 */
export const SLA_DEADLINES_MINUTES: Record<string, number> = {
  'NEEDS_SCRIPT': 48 * 60,     // 48 hours to get a script
  'GENERATING_SCRIPT': 60,     // 1 hour for AI generation
  'NOT_RECORDED': 24 * 60,     // 24 hours
  'AI_RENDERING': 30,          // 30 minutes for Runway render
  'READY_FOR_REVIEW': 24 * 60, // 24 hours to review composed video
  'RECORDED': 24 * 60,         // 24 hours
  'EDITED': 24 * 60,           // 24 hours
  'APPROVED_NEEDS_EDITS': 24 * 60, // 24 hours to complete edits
  'READY_TO_POST': 12 * 60,    // 12 hours
  'REJECTED': 24 * 60,         // 24 hours followup
  'POSTED': 0,                 // No SLA for terminal state
};

/**
 * Threshold in minutes before deadline to show "due_soon" warning
 */
export const SLA_DUE_SOON_THRESHOLD_MINUTES = 60; // 1 hour before deadline

export type SlaStatus = 'on_track' | 'due_soon' | 'overdue';

export interface SlaInfo {
  sla_deadline_at: string | null;
  sla_status: SlaStatus;
  age_minutes_in_stage: number;
  priority_score: number;
}

export type RecordingStatus = typeof RECORDING_STATUSES[number];

export function isValidRecordingStatus(status: unknown): status is RecordingStatus {
  return typeof status === 'string' && RECORDING_STATUSES.includes(status as RecordingStatus);
}

// Next logical status in the pipeline
const NEXT_STATUS_MAP: Record<RecordingStatus, RecordingStatus | null> = {
  'NEEDS_SCRIPT': 'NOT_RECORDED',
  'GENERATING_SCRIPT': 'NOT_RECORDED',
  'NOT_RECORDED': 'RECORDED',
  'AI_RENDERING': 'READY_FOR_REVIEW',
  'READY_FOR_REVIEW': 'READY_TO_POST',
  'RECORDED': 'EDITED',
  'EDITED': 'READY_TO_POST',
  'APPROVED_NEEDS_EDITS': 'READY_TO_POST',
  'READY_TO_POST': 'POSTED',
  'POSTED': null, // Terminal
  'REJECTED': null, // Terminal
};

// Human-readable next action
const NEXT_ACTION_MAP: Record<RecordingStatus, string> = {
  'NEEDS_SCRIPT': 'Add a script',
  'GENERATING_SCRIPT': 'Waiting for AI script',
  'NOT_RECORDED': 'Record the video',
  'AI_RENDERING': 'Waiting for AI video render',
  'READY_FOR_REVIEW': 'Approve or reject the video',
  'RECORDED': 'Edit the video',
  'EDITED': 'Mark ready to post',
  'APPROVED_NEEDS_EDITS': 'Apply edits, then mark ready to post',
  'READY_TO_POST': 'Post the video',
  'POSTED': 'Done',
  'REJECTED': 'Review rejection notes',
};

export interface VideoForValidation {
  recording_status?: string | null;
  recording_notes?: string | null;
  editor_notes?: string | null;
  uploader_notes?: string | null;
  posted_url?: string | null;
  posted_platform?: string | null;
  final_video_url?: string | null;
  google_drive_url?: string | null;
  script_locked_text?: string | null;
  script_not_required?: boolean | null;
}

export interface TransitionValidation {
  valid: boolean;
  code: ApiErrorCode | null;
  error: string | null;
  details: Record<string, unknown> | null;
}

/**
 * Validate a status transition
 * @param targetStatus - The status we're trying to transition to
 * @param video - Current video state (with any pending updates merged)
 * @param force - If true, skip validation (but still return the would-be error for reference)
 */
export function validateStatusTransition(
  targetStatus: RecordingStatus,
  video: VideoForValidation,
  force: boolean = false
): TransitionValidation {
  // READY_TO_POST requires final_video_url OR google_drive_url
  if (targetStatus === 'READY_TO_POST') {
    const hasFinalUrl = video.final_video_url && video.final_video_url.trim() !== '';
    const hasDriveUrl = video.google_drive_url && video.google_drive_url.trim() !== '';

    if (!hasFinalUrl && !hasDriveUrl) {
      return {
        valid: force,
        code: 'MISSING_VIDEO_URL',
        error: 'READY_TO_POST requires final_video_url or google_drive_url',
        details: {
          final_video_url: video.final_video_url || null,
          google_drive_url: video.google_drive_url || null,
        },
      };
    }
  }

  // POSTED requires posted_url and posted_platform
  if (targetStatus === 'POSTED') {
    const hasPostedUrl = video.posted_url && video.posted_url.trim() !== '';
    const hasPlatform = video.posted_platform && video.posted_platform.trim() !== '';

    if (!hasPostedUrl || !hasPlatform) {
      return {
        valid: force,
        code: 'MISSING_POSTED_FIELDS',
        error: 'POSTED requires posted_url and posted_platform',
        details: {
          posted_url: video.posted_url || null,
          posted_platform: video.posted_platform || null,
        },
      };
    }
  }

  // REJECTED requires at least one notes field
  if (targetStatus === 'REJECTED') {
    const hasRecordingNotes = video.recording_notes && video.recording_notes.trim() !== '';
    const hasEditorNotes = video.editor_notes && video.editor_notes.trim() !== '';
    const hasUploaderNotes = video.uploader_notes && video.uploader_notes.trim() !== '';

    if (!hasRecordingNotes && !hasEditorNotes && !hasUploaderNotes) {
      return {
        valid: force,
        code: 'MISSING_REJECTION_NOTES',
        error: 'REJECTED requires at least one notes field (recording_notes, editor_notes, or uploader_notes)',
        details: {
          recording_notes: video.recording_notes || null,
          editor_notes: video.editor_notes || null,
          uploader_notes: video.uploader_notes || null,
        },
      };
    }
  }

  return { valid: true, code: null, error: null, details: null };
}

export interface StageInfo {
  can_move_next: boolean;
  blocked_reason: string | null;
  next_action: string;
  next_status: RecordingStatus | null;
  // Individual action flags
  can_record: boolean;
  can_mark_edited: boolean;
  can_mark_ready_to_post: boolean;
  can_mark_posted: boolean;
  can_approve_review: boolean;
  // Required fields for next step
  required_fields: string[];
}

/**
 * Compute stage info for a video (used in queue list)
 */
export function computeStageInfo(video: VideoForValidation): StageInfo {
  const currentStatus = (video.recording_status || 'NOT_RECORDED') as RecordingStatus;
  const nextStatus = NEXT_STATUS_MAP[currentStatus];
  let nextAction = NEXT_ACTION_MAP[currentStatus];

  // Check if script is locked (required before recording) or not required
  const hasLockedScript = !!video.script_locked_text;
  const scriptSatisfied = hasLockedScript || !!video.script_not_required;

  // Compute individual action flags
  const can_record = currentStatus === 'NOT_RECORDED' && scriptSatisfied;
  const can_mark_edited = currentStatus === 'RECORDED';

  // READY_FOR_REVIEW approval (AI videos skip EDITED/RECORDED)
  const can_approve_review = currentStatus === 'READY_FOR_REVIEW';

  // READY_TO_POST requires video URL
  const hasVideoUrl = !!(video.final_video_url?.trim() || video.google_drive_url?.trim());
  const can_mark_ready_to_post = (currentStatus === 'EDITED' && hasVideoUrl) || (currentStatus === 'READY_FOR_REVIEW' && hasVideoUrl) || (currentStatus === 'APPROVED_NEEDS_EDITS' && hasVideoUrl);

  // POSTED requires posted_url and posted_platform
  const hasPostedUrl = !!video.posted_url?.trim();
  const hasPlatform = !!video.posted_platform?.trim();
  const can_mark_posted = currentStatus === 'READY_TO_POST' && hasPostedUrl && hasPlatform;

  // Compute required_fields for next step
  let required_fields: string[] = [];
  if (currentStatus === 'NOT_RECORDED' && !scriptSatisfied) {
    required_fields = ['script'];
  } else if (currentStatus === 'EDITED' && !hasVideoUrl) {
    required_fields = ['final_video_url', 'google_drive_url'];
  } else if (currentStatus === 'READY_TO_POST') {
    if (!hasPostedUrl) required_fields.push('posted_url');
    if (!hasPlatform) required_fields.push('posted_platform');
  }

  // Terminal states
  if (!nextStatus) {
    return {
      can_move_next: false,
      blocked_reason: null,
      next_action: nextAction,
      next_status: null,
      can_record: false,
      can_mark_edited: false,
      can_mark_ready_to_post: false,
      can_mark_posted: false,
      can_approve_review: false,
      required_fields: [],
    };
  }

  // Override next_action if script is needed (but not if script_not_required)
  if (currentStatus === 'NOT_RECORDED' && !scriptSatisfied) {
    nextAction = 'Attach and lock a script';
    return {
      can_move_next: false,
      blocked_reason: 'Script must be attached and locked before recording',
      next_action: nextAction,
      next_status: nextStatus,
      can_record: false,
      can_mark_edited: false,
      can_mark_ready_to_post: false,
      can_mark_posted: false,
      can_approve_review: false,
      required_fields,
    };
  }

  // Validate transition to next status
  const validation = validateStatusTransition(nextStatus, video, false);

  if (!validation.valid) {
    return {
      can_move_next: false,
      blocked_reason: validation.error,
      next_action: nextAction,
      next_status: nextStatus,
      can_record,
      can_mark_edited,
      can_mark_ready_to_post,
      can_mark_posted,
      can_approve_review,
      required_fields,
    };
  }

  return {
    can_move_next: true,
    blocked_reason: null,
    next_action: nextAction,
    next_status: nextStatus,
    can_record,
    can_mark_edited,
    can_mark_ready_to_post,
    can_mark_posted,
    can_approve_review,
    required_fields,
  };
}

/**
 * Compute SLA info for a video
 * @param recordingStatus - Current recording status
 * @param lastStatusChangedAt - ISO timestamp of when status last changed
 * @param now - Current timestamp (for testing, defaults to now)
 */
export function computeSlaInfo(
  recordingStatus: string | null,
  lastStatusChangedAt: string | null,
  now: Date = new Date()
): SlaInfo {
  const status = recordingStatus || 'NOT_RECORDED';

  // Terminal states have no SLA
  if (status === 'POSTED') {
    return {
      sla_deadline_at: null,
      sla_status: 'on_track',
      age_minutes_in_stage: 0,
      priority_score: 0,
    };
  }

  // If no timestamp, treat as just entered (now)
  const enteredAt = lastStatusChangedAt ? new Date(lastStatusChangedAt) : now;
  const ageMs = now.getTime() - enteredAt.getTime();
  const ageMinutes = Math.floor(ageMs / (1000 * 60));

  // Get SLA deadline for this status
  const slaMinutes = SLA_DEADLINES_MINUTES[status] || SLA_DEADLINES_MINUTES['NOT_RECORDED'];

  // Compute deadline timestamp
  const deadlineAt = new Date(enteredAt.getTime() + slaMinutes * 60 * 1000);
  const minutesUntilDeadline = Math.floor((deadlineAt.getTime() - now.getTime()) / (1000 * 60));

  // Determine SLA status
  let slaStatus: SlaStatus;
  if (minutesUntilDeadline < 0) {
    slaStatus = 'overdue';
  } else if (minutesUntilDeadline <= SLA_DUE_SOON_THRESHOLD_MINUTES) {
    slaStatus = 'due_soon';
  } else {
    slaStatus = 'on_track';
  }

  // Compute priority score (higher = more urgent)
  // Base: overdue items get high score, due_soon medium, on_track low
  // Within each tier, older items get higher score
  let priorityScore: number;
  if (slaStatus === 'overdue') {
    // Overdue: 1000 + minutes overdue (more overdue = higher priority)
    priorityScore = 1000 + Math.abs(minutesUntilDeadline);
  } else if (slaStatus === 'due_soon') {
    // Due soon: 500 + (threshold - minutes remaining) (closer to deadline = higher)
    priorityScore = 500 + (SLA_DUE_SOON_THRESHOLD_MINUTES - minutesUntilDeadline);
  } else {
    // On track: based on age (older = higher priority, but capped)
    priorityScore = Math.min(ageMinutes, 499);
  }

  return {
    sla_deadline_at: deadlineAt.toISOString(),
    sla_status: slaStatus,
    age_minutes_in_stage: ageMinutes,
    priority_score: priorityScore,
  };
}
