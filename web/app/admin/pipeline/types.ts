export type SlaStatus = 'on_track' | 'due_soon' | 'overdue' | 'no_due_date';

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
  script_not_required?: boolean | null;
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
  product_category?: string | null;
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
    case 'NEEDS_SCRIPT':
      return { bg: '#fff4e6', border: '#ffa94d', badge: '#e8590c' };
    case 'GENERATING_SCRIPT':
      return { bg: '#e8d5f5', border: '#b197fc', badge: '#7950f2' };
    case 'NOT_RECORDED':
      return { bg: '#f8f9fa', border: '#dee2e6', badge: '#6c757d' };
    case 'AI_RENDERING':
      return { bg: '#f3e8ff', border: '#c084fc', badge: '#9333ea' };
    case 'READY_FOR_REVIEW':
      return { bg: '#ecfdf5', border: '#6ee7b7', badge: '#059669' };
    case 'RECORDED':
      return { bg: '#e7f5ff', border: '#74c0fc', badge: '#228be6' };
    case 'EDITED':
      return { bg: '#fff3bf', border: '#ffd43b', badge: '#fab005' };
    case 'APPROVED_NEEDS_EDITS':
      return { bg: '#fff3bf', border: '#fbbf24', badge: '#d97706' };
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
    case 'no_due_date':
      return { bg: '#f8f9fa', text: '#868e96', border: '#dee2e6' };
    default:
      return { bg: '#f8f9fa', text: '#495057', border: '#dee2e6' };
  }
}

// Primary action determination
export interface PrimaryAction {
  type: 'add_script' | 'record' | 'upload_edit' | 'approve' | 'post' | 'done' | 'view_rejection' | 're_generate';
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
}

export function getPrimaryAction(video: QueueVideo): PrimaryAction {
  // If generating script: show waiting state
  if (video.recording_status === 'GENERATING_SCRIPT') {
    return {
      type: 'add_script',
      label: 'Generating Script...',
      shortLabel: 'Generating',
      color: '#7950f2',
      icon: '',
    };
  }

  // If script_not_required, skip script gating entirely
  if (video.script_not_required) {
    // Jump to recording or later stage based on recording_status
    if (!video.recording_status || video.recording_status === 'NEEDS_SCRIPT' || video.recording_status === 'NOT_RECORDED') {
      return {
        type: 'record',
        label: 'Mark Recorded',
        shortLabel: 'Record',
        color: '#228be6',
        icon: '',
      };
    }
    // Fall through to other status checks below
  } else if (video.recording_status === 'NEEDS_SCRIPT' || !video.script_locked_text) {
    // If needs script or no locked script: primary = Add Script
    return {
      type: 'add_script',
      label: 'Add Script',
      shortLabel: 'Script',
      color: '#17a2b8',
      icon: '',
    };
  }

  // If NOT_RECORDED and has script: primary = Record Done
  if (video.recording_status === 'NOT_RECORDED' && video.can_record) {
    return {
      type: 'record',
      label: 'Mark Recorded',
      shortLabel: 'Record',
      color: '#228be6',
      icon: '',
    };
  }

  // If READY_FOR_REVIEW (AI video composed): primary = Approve Video
  if (video.recording_status === 'READY_FOR_REVIEW') {
    return {
      type: 'approve',
      label: 'Approve Video',
      shortLabel: 'Approve',
      color: '#059669',
      icon: '',
    };
  }

  // If RECORDED (Ready for Review): primary = Approve
  if (video.recording_status === 'RECORDED') {
    return {
      type: 'approve',
      label: 'Approve',
      shortLabel: 'Approve',
      color: '#40c057',
      icon: '',
    };
  }

  // If EDITED (legacy): primary = Approve
  if (video.recording_status === 'EDITED') {
    return {
      type: 'approve',
      label: 'Approve',
      shortLabel: 'Approve',
      color: '#40c057',
      icon: '',
    };
  }

  // If APPROVED_NEEDS_EDITS: primary = Mark Ready to Post
  if (video.recording_status === 'APPROVED_NEEDS_EDITS') {
    return {
      type: 'upload_edit',
      label: 'Mark Ready to Post',
      shortLabel: 'Ready',
      color: '#d97706',
      icon: '',
    };
  }

  // If READY_TO_POST: primary = Post
  if (video.recording_status === 'READY_TO_POST') {
    return {
      type: 'post',
      label: 'Post Video',
      shortLabel: 'Post',
      color: '#1971c2',
      icon: '',
    };
  }

  // If REJECTED: re-generate
  if (video.recording_status === 'REJECTED') {
    return {
      type: 're_generate',
      label: 'Re-generate',
      shortLabel: 'Redo',
      color: '#6366f1',
      icon: '',
    };
  }

  // If POSTED: done
  return {
    type: 'done',
    label: 'Complete',
    shortLabel: 'Done',
    color: '#40c057',
    icon: '',
  };
}

// Readiness icons
export interface ReadinessIndicators {
  hasScript: boolean;
  hasRaw: boolean;
  hasFinal: boolean;
}

export function getReadinessIndicators(video: QueueVideo): ReadinessIndicators {
  const preRecordingStates = ['NEEDS_SCRIPT', 'GENERATING_SCRIPT', 'NOT_RECORDED'];
  return {
    hasScript: !!video.script_locked_text || !!video.script_not_required,
    hasRaw: !preRecordingStates.includes(video.recording_status || '') && video.recording_status !== null,
    hasFinal: !!video.final_video_url || video.recording_status === 'EDITED' || video.recording_status === 'READY_TO_POST' || video.recording_status === 'POSTED',
  };
}

/**
 * Generate a readable display title for a video.
 * Format: "[Brand] - [Product] #[N]"
 * Example: "Snap Supplements - Big Boy Bundle #1"
 * Falls back to video_code or truncated ID.
 */
export function getVideoDisplayTitle(video: Pick<QueueVideo, 'brand_name' | 'product_name' | 'product_sku' | 'product_category' | 'video_code' | 'id'>): string {
  const brand = video.brand_name;
  const product = video.product_name || video.product_sku;
  const category = video.product_category;

  // Extract sequence number from video_code (last segment, e.g., "001" from "UNMAPD-SNAPSU-BIGBOY-02-12-26-001")
  let seq = '';
  if (video.video_code) {
    const match = video.video_code.match(/-(\d{3})$/);
    if (match) seq = `#${parseInt(match[1], 10)}`;
  }

  // Build segments: [Brand] - [Product] - [Category] #[N]
  const parts: string[] = [];
  if (brand) parts.push(brand);
  if (product) parts.push(product);
  if (category) parts.push(category);

  if (parts.length > 0) {
    return parts.join(' - ') + (seq ? ' ' + seq : '');
  }

  // Fallback to video_code or truncated ID
  return video.video_code || video.id.slice(0, 8);
}
