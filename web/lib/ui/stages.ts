/**
 * Simplified 4-stage UI model for FlashFlow pipeline.
 *
 * Maps any combination of status + recording_status to one of four
 * user-facing stages. All pipeline UI should derive stage from this
 * single source of truth rather than branching on raw status strings.
 */

export type UIStage = 'needs_recording' | 'needs_editing' | 'ready_to_post' | 'posted';

export interface StageConfig {
  stage: UIStage;
  label: string;
  /** One sentence shown to the user explaining what to do next */
  description: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
  /** Which raw recording_status values map to this stage */
  recordingStatuses: string[];
}

export const STAGE_CONFIGS: Record<UIStage, StageConfig> = {
  needs_recording: {
    stage: 'needs_recording',
    label: 'Needs Recording',
    description: 'Pick up your phone and record this video.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/25',
    dot: 'bg-blue-400',
    recordingStatuses: ['NEEDS_SCRIPT', 'GENERATING_SCRIPT', 'NOT_RECORDED'],
  },
  needs_editing: {
    stage: 'needs_editing',
    label: 'Needs Editing',
    description: 'Footage is in — edit and upload the final cut.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    dot: 'bg-amber-400',
    recordingStatuses: ['AI_RENDERING', 'READY_FOR_REVIEW', 'RECORDED', 'EDITED', 'APPROVED_NEEDS_EDITS'],
  },
  ready_to_post: {
    stage: 'ready_to_post',
    label: 'Ready to Post',
    description: "This video is approved — post it on TikTok now.",
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/25',
    dot: 'bg-teal-400',
    recordingStatuses: ['READY_TO_POST'],
  },
  posted: {
    stage: 'posted',
    label: 'Posted',
    description: "Live on TikTok. Track your performance.",
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/25',
    dot: 'bg-green-400',
    recordingStatuses: ['POSTED'],
  },
};

export const STAGE_ORDER: UIStage[] = ['needs_recording', 'needs_editing', 'ready_to_post', 'posted'];

/**
 * Maps a video's recording_status (and optionally content item status)
 * to one of the 4 simple UI stages.
 */
export function getUIStage(
  recordingStatus: string | null,
  contentStatus?: string | null,
): UIStage {
  // Posted always wins
  if (recordingStatus === 'POSTED' || contentStatus === 'posted') {
    return 'posted';
  }

  // Ready to post
  if (recordingStatus === 'READY_TO_POST' || contentStatus === 'ready_to_post') {
    return 'ready_to_post';
  }

  // Needs editing: footage captured, waiting for edit
  if (
    recordingStatus === 'RECORDED' ||
    recordingStatus === 'AI_RENDERING' ||
    recordingStatus === 'EDITED' ||
    recordingStatus === 'APPROVED_NEEDS_EDITS' ||
    recordingStatus === 'READY_FOR_REVIEW'
  ) {
    return 'needs_editing';
  }

  // Default: needs recording
  return 'needs_recording';
}

/**
 * Returns all recording_status values that belong to a given UI stage.
 * Useful for filtering a list of videos by stage.
 */
export function getStatusesForStage(stage: UIStage): string[] {
  return STAGE_CONFIGS[stage].recordingStatuses;
}
