// video-pipeline.ts - Phase 8 video pipeline contract enforcement
// ============================================================================
// CANONICAL VIDEO STATUS DEFINITIONS
// This is the single source of truth for all video.status values.
// Any code that references video statuses MUST import from this file.
// ============================================================================

/**
 * All valid video status values.
 * - draft: Initial state for videos created from variants
 * - needs_edit: Video needs editing work
 * - ready_to_post: Video is edited and ready for posting
 * - posted: Video has been posted to platform
 * - failed: Video processing failed (can retry)
 * - archived: Video is archived (terminal state)
 */
export const VIDEO_STATUSES = [
  "draft",
  "needs_edit",
  "ready_to_post",
  "posted",
  "failed",
  "archived"
] as const;

export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/**
 * Statuses that represent active work queues.
 * Videos in these statuses require a claim before status changes.
 */
export const QUEUE_STATUSES = ["needs_edit", "ready_to_post"] as const;

export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/**
 * Statuses that represent terminal or completed states.
 */
export const TERMINAL_STATUSES = ["posted", "archived"] as const;

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

/**
 * Statuses that require a reason when transitioning TO them.
 */
export const REASON_REQUIRED_STATUSES = ["failed", "archived"] as const;

// ============================================================================
// ALLOWED TRANSITIONS GRAPH
// Key: current status, Value: array of allowed next statuses
// Any transition not in this map is INVALID and must be rejected.
// ============================================================================

export const ALLOWED_TRANSITIONS: Record<VideoStatus, readonly VideoStatus[]> = {
  draft: ["needs_edit", "archived"],
  needs_edit: ["ready_to_post", "failed", "archived"],
  ready_to_post: ["posted", "failed", "archived"],
  posted: ["archived"],
  failed: ["needs_edit", "archived"],
  archived: [] // Terminal state - no transitions allowed
};

// Legacy alias for backwards compatibility
export const allowedTransitions = ALLOWED_TRANSITIONS;

// ============================================================================
// STATUS VALIDATION FUNCTIONS
// ============================================================================

export function isValidStatus(v: string): v is VideoStatus {
  return VIDEO_STATUSES.includes(v as VideoStatus);
}

export function isQueueStatus(v: string): v is QueueStatus {
  return QUEUE_STATUSES.includes(v as QueueStatus);
}

export function isTerminalStatus(v: string): v is TerminalStatus {
  return TERMINAL_STATUSES.includes(v as TerminalStatus);
}

export function requiresReason(status: string): boolean {
  return REASON_REQUIRED_STATUSES.includes(status as typeof REASON_REQUIRED_STATUSES[number]);
}

// ============================================================================
// TRANSITION VALIDATION
// ============================================================================

/**
 * Check if a transition is allowed.
 */
export function canTransition(from: VideoStatus, to: VideoStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Get allowed next statuses for a given status.
 */
export function getAllowedNextStatuses(from: VideoStatus): readonly VideoStatus[] {
  return ALLOWED_TRANSITIONS[from] || [];
}

/**
 * Assert that a transition is valid. Throws if invalid.
 * @deprecated Use canTransition() and handle errors explicitly instead.
 */
export function assertVideoTransition(from: VideoStatus, to: VideoStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid video status transition: ${from} -> ${to}`);
  }
}

// ============================================================================
// RECORDING STATUS DEFINITIONS (VA workflow)
// ============================================================================

/**
 * All valid recording_status values for the VA recording workflow.
 * These track the physical production lifecycle of a video.
 */
export const RECORDING_STATUSES = [
  "NOT_RECORDED",
  "AI_RENDERING",
  "RECORDED",
  "EDITED",
  "READY_FOR_REVIEW",
  "APPROVED_NEEDS_EDITS",
  "READY_TO_POST",
  "POSTED",
  "REJECTED",
] as const;

export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

/**
 * Allowed recording_status transitions.
 * Key: current recording_status, Value: array of allowed next statuses.
 */
export const ALLOWED_RECORDING_TRANSITIONS: Record<RecordingStatus, readonly RecordingStatus[]> = {
  NOT_RECORDED: ["AI_RENDERING", "RECORDED", "REJECTED"],
  AI_RENDERING: ["RECORDED", "EDITED", "READY_FOR_REVIEW", "REJECTED"],
  RECORDED: ["EDITED", "REJECTED"],
  EDITED: ["READY_TO_POST", "REJECTED"],
  READY_FOR_REVIEW: ["APPROVED_NEEDS_EDITS", "READY_TO_POST", "REJECTED"],
  APPROVED_NEEDS_EDITS: ["READY_TO_POST", "REJECTED"],
  READY_TO_POST: ["POSTED", "REJECTED"],
  POSTED: [], // Terminal
  REJECTED: ["NOT_RECORDED"], // Can restart from rejected
};

export function isValidRecordingStatus(v: string): v is RecordingStatus {
  return RECORDING_STATUSES.includes(v as RecordingStatus);
}

/**
 * Check if a recording_status transition is allowed.
 */
export function canTransitionRecording(from: RecordingStatus, to: RecordingStatus): boolean {
  const allowed = ALLOWED_RECORDING_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
