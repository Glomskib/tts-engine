export type SlaStatus = 'on_track' | 'due_soon' | 'overdue';

export interface QueueVideo {
  id: string;
  video_code: string | null;
  variant_id: string;
  account_id: string;
  status: string;
  google_drive_url: string;
  created_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  claim_role: string | null;
  recording_status: string | null;
  last_status_changed_at: string | null;
  posted_url: string | null;
  posted_platform: string | null;
  script_locked_text: string | null;
  script_locked_version: number | null;
  concept_id: string | null;
  product_id: string | null;
  final_video_url?: string | null;
  // Computed fields from API
  can_move_next: boolean;
  blocked_reason: string | null;
  next_action: string;
  next_status: string | null;
  // Individual action flags
  can_record: boolean;
  can_mark_edited: boolean;
  can_mark_ready_to_post: boolean;
  can_mark_posted: boolean;
  required_fields: string[];
  // SLA fields
  sla_deadline_at: string | null;
  sla_status: SlaStatus;
  age_minutes_in_stage: number;
  priority_score: number;
  // Extended fields for board view (optional)
  brand_name?: string;
  product_name?: string;
  product_sku?: string;
  account_name?: string;
  // Posting account
  posting_account_id?: string | null;
  posting_account_name?: string;
  posting_account_code?: string;
}

export interface BoardFilters {
  brand: string;
  product: string;
  account: string;
}

export interface AvailableScript {
  id: string;
  title: string | null;
  status: string;
  version: number;
  created_at: string;
  concept_id: string | null;
  product_id: string | null;
  spoken_script?: string;
}

// Status badge colors
export function getStatusBadgeColor(status: string | null): { bg: string; border: string; badge: string } {
  switch (status) {
    case 'NOT_RECORDED':
      return { bg: '#f8f9fa', border: '#dee2e6', badge: '#6c757d' };
    case 'RECORDED':
      return { bg: '#e7f5ff', border: '#74c0fc', badge: '#228be6' };
    case 'EDITED':
      return { bg: '#fff3bf', border: '#ffd43b', badge: '#fab005' };
    case 'READY_TO_POST':
      return { bg: '#d3f9d8', border: '#69db7c', badge: '#40c057' };
    case 'POSTED':
      return { bg: '#d0ebff', border: '#339af0', badge: '#1971c2' };
    case 'REJECTED':
      return { bg: '#ffe3e3', border: '#ff8787', badge: '#e03131' };
    default:
      return { bg: '#f8f9fa', border: '#dee2e6', badge: '#6c757d' };
  }
}

// SLA badge colors
export function getSlaColor(status: SlaStatus): { bg: string; text: string; border: string } {
  switch (status) {
    case 'overdue':
      return { bg: '#ffe3e3', text: '#c92a2a', border: '#ffa8a8' };
    case 'due_soon':
      return { bg: '#fff3bf', text: '#e67700', border: '#ffd43b' };
    case 'on_track':
      return { bg: '#d3f9d8', text: '#2b8a3e', border: '#69db7c' };
    default:
      return { bg: '#f8f9fa', text: '#495057', border: '#dee2e6' };
  }
}

// Primary action determination
export interface PrimaryAction {
  type: 'add_script' | 'record' | 'upload_edit' | 'approve' | 'post' | 'done' | 'view_rejection';
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
}

export function getPrimaryAction(video: QueueVideo): PrimaryAction {
  // If no locked script: primary = Add Script
  if (!video.script_locked_text) {
    return {
      type: 'add_script',
      label: 'Add Script',
      shortLabel: 'Script',
      color: '#17a2b8',
      icon: '📝',
    };
  }

  // If NOT_RECORDED and has script: primary = Record Done
  if (video.recording_status === 'NOT_RECORDED' && video.can_record) {
    return {
      type: 'record',
      label: 'Mark Recorded',
      shortLabel: 'Record',
      color: '#228be6',
      icon: '🎬',
    };
  }

  // If RECORDED: primary = Upload Edit / Mark Edited
  if (video.recording_status === 'RECORDED') {
    return {
      type: 'upload_edit',
      label: 'Mark Edited',
      shortLabel: 'Edited',
      color: '#fab005',
      icon: '✂️',
    };
  }

  // If EDITED: primary = Approve / Mark Ready
  if (video.recording_status === 'EDITED') {
    return {
      type: 'approve',
      label: 'Mark Ready',
      shortLabel: 'Ready',
      color: '#40c057',
      icon: '✅',
    };
  }

  // If READY_TO_POST: primary = Post
  if (video.recording_status === 'READY_TO_POST') {
    return {
      type: 'post',
      label: 'Post Video',
      shortLabel: 'Post',
      color: '#1971c2',
      icon: '🚀',
    };
  }

  // If REJECTED: view notes
  if (video.recording_status === 'REJECTED') {
    return {
      type: 'view_rejection',
      label: 'View Notes',
      shortLabel: 'Notes',
      color: '#e03131',
      icon: '⚠️',
    };
  }

  // If POSTED: done
  return {
    type: 'done',
    label: 'Complete',
    shortLabel: 'Done',
    color: '#40c057',
    icon: '🎉',
  };
}

// Readiness icons
export interface ReadinessIndicators {
  hasScript: boolean;
  hasRaw: boolean;
  hasFinal: boolean;
}

export function getReadinessIndicators(video: QueueVideo): ReadinessIndicators {
  return {
    hasScript: !!video.script_locked_text,
    hasRaw: video.recording_status !== 'NOT_RECORDED' && video.recording_status !== null,
    hasFinal: !!video.final_video_url || video.recording_status === 'EDITED' || video.recording_status === 'READY_TO_POST' || video.recording_status === 'POSTED',
  };
}
