/**
 * Execution stage validation and helpers
 * Used by both execution route (server-side validation) and queue route (computed fields)
 */

import type { ApiErrorCode } from './api-errors';

export const RECORDING_STATUSES = [
  'NOT_RECORDED',
  'RECORDED',
  'EDITED',
  'READY_TO_POST',
  'POSTED',
  'REJECTED',
] as const;

export type RecordingStatus = typeof RECORDING_STATUSES[number];

export function isValidRecordingStatus(status: unknown): status is RecordingStatus {
  return typeof status === 'string' && RECORDING_STATUSES.includes(status as RecordingStatus);
}

// Next logical status in the pipeline
const NEXT_STATUS_MAP: Record<RecordingStatus, RecordingStatus | null> = {
  'NOT_RECORDED': 'RECORDED',
  'RECORDED': 'EDITED',
  'EDITED': 'READY_TO_POST',
  'READY_TO_POST': 'POSTED',
  'POSTED': null, // Terminal
  'REJECTED': null, // Terminal
};

// Human-readable next action
const NEXT_ACTION_MAP: Record<RecordingStatus, string> = {
  'NOT_RECORDED': 'Record the video',
  'RECORDED': 'Edit the video',
  'EDITED': 'Mark ready to post',
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

  // Check if script is locked (required before recording)
  const hasLockedScript = !!video.script_locked_text;

  // Compute individual action flags
  const can_record = currentStatus === 'NOT_RECORDED' && hasLockedScript;
  const can_mark_edited = currentStatus === 'RECORDED';

  // READY_TO_POST requires video URL
  const hasVideoUrl = !!(video.final_video_url?.trim() || video.google_drive_url?.trim());
  const can_mark_ready_to_post = currentStatus === 'EDITED' && hasVideoUrl;

  // POSTED requires posted_url and posted_platform
  const hasPostedUrl = !!video.posted_url?.trim();
  const hasPlatform = !!video.posted_platform?.trim();
  const can_mark_posted = currentStatus === 'READY_TO_POST' && hasPostedUrl && hasPlatform;

  // Compute required_fields for next step
  let required_fields: string[] = [];
  if (currentStatus === 'NOT_RECORDED' && !hasLockedScript) {
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
      required_fields: [],
    };
  }

  // Override next_action if script is needed
  if (currentStatus === 'NOT_RECORDED' && !hasLockedScript) {
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
    required_fields,
  };
}
