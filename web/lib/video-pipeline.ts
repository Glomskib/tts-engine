// video-pipeline.ts - Phase 8 video pipeline contract enforcement

export const VIDEO_STATUSES = [
  "needs_edit",
  "ready_to_post",
  "posted",
  "failed",
  "archived"
] as const;

export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const QUEUE_STATUSES = ["needs_edit", "ready_to_post"] as const;

export type QueueStatus = (typeof QUEUE_STATUSES)[number];

// Allowed status transitions map
// Key: current status, Value: array of allowed next statuses
export const allowedTransitions: Record<VideoStatus, readonly VideoStatus[]> = {
  needs_edit: ["ready_to_post", "failed", "archived"],
  ready_to_post: ["posted", "failed", "archived"],
  failed: ["needs_edit", "archived"],
  posted: ["archived"],
  archived: []
};

export function isValidStatus(v: string): v is VideoStatus {
  return VIDEO_STATUSES.includes(v as VideoStatus);
}

export function isQueueStatus(v: string): v is QueueStatus {
  return QUEUE_STATUSES.includes(v as QueueStatus);
}

export function assertVideoTransition(from: VideoStatus, to: VideoStatus): void {
  const allowed = allowedTransitions[from];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid video status transition: ${from} -> ${to}`);
  }
}

export function canTransition(from: VideoStatus, to: VideoStatus): boolean {
  const allowed = allowedTransitions[from];
  return allowed.includes(to);
}
