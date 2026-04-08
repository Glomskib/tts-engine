/**
 * Simplified pipeline status state machine — FlashFlow Phase 3.
 *
 * Maps the (many) legacy `recording_status` values to the 5 canonical
 * pipeline states a user cares about, with color + plain-English
 * explanation for tooltips/legends.
 */

export type DisplayStatusKey = 'draft' | 'approved' | 'rendering' | 'ready' | 'failed';

export interface DisplayStatus {
  key: DisplayStatusKey;
  label: string;
  color: string;     // tailwind classes bg + text
  dot: string;       // dot color class
  explanation: string;
}

export const DISPLAY_STATUSES: Record<DisplayStatusKey, DisplayStatus> = {
  draft: {
    key: 'draft',
    label: 'Draft',
    color: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
    dot: 'bg-zinc-400',
    explanation: 'Not yet approved. Sitting in Content Studio as a working draft.',
  },
  approved: {
    key: 'approved',
    label: 'Approved',
    color: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    dot: 'bg-amber-400',
    explanation: 'Queued for production. Will start rendering as soon as a render worker is available.',
  },
  rendering: {
    key: 'rendering',
    label: 'Rendering',
    color: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
    dot: 'bg-violet-400',
    explanation: 'Currently being rendered into a video. This usually takes a few minutes.',
  },
  ready: {
    key: 'ready',
    label: 'Ready',
    color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    dot: 'bg-emerald-400',
    explanation: 'Ready to post. The video has been produced and reviewed.',
  },
  failed: {
    key: 'failed',
    label: 'Failed',
    color: 'bg-red-500/10 text-red-300 border-red-500/20',
    dot: 'bg-red-400',
    explanation: 'Something went wrong. Retry the render or check the error log.',
  },
};

interface VideoLike {
  status?: string | null;
  recording_status?: string | null;
  render_skipped?: boolean | null;
  render_status?: string | null;
}

export function getDisplayStatus(video: VideoLike): DisplayStatus {
  if (video.render_skipped) return DISPLAY_STATUSES.approved;

  const rs = (video.recording_status || video.status || '').toUpperCase();
  switch (rs) {
    case 'NEEDS_SCRIPT':
    case 'GENERATING_SCRIPT':
    case 'DRAFT':
      return DISPLAY_STATUSES.draft;
    case 'NOT_RECORDED':
    case 'APPROVED':
    case 'QUEUED':
      return DISPLAY_STATUSES.approved;
    case 'AI_RENDERING':
    case 'RENDERING':
      return DISPLAY_STATUSES.rendering;
    case 'READY_FOR_REVIEW':
    case 'RECORDED':
    case 'EDITED':
    case 'APPROVED_NEEDS_EDITS':
    case 'READY_TO_POST':
    case 'POSTED':
    case 'READY':
      return DISPLAY_STATUSES.ready;
    case 'REJECTED':
    case 'FAILED':
    case 'ERROR':
      return DISPLAY_STATUSES.failed;
    default:
      return DISPLAY_STATUSES.draft;
  }
}

export const PIPELINE_LEGEND: DisplayStatus[] = [
  DISPLAY_STATUSES.draft,
  DISPLAY_STATUSES.approved,
  DISPLAY_STATUSES.rendering,
  DISPLAY_STATUSES.ready,
  DISPLAY_STATUSES.failed,
];
