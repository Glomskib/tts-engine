/**
 * Next Action Logic for Videos
 *
 * Determines the next best action for a video based on its status,
 * recording status, and available data (blockers).
 */

export interface NextActionResult {
  label: string;
  action: string;
  href?: string;
  blockers: string[];
}

interface VideoForAction {
  id: string;
  status: string;
  recording_status: string | null;
  google_drive_url: string | null;
  script_locked_text: string | null;
  product_id: string | null;
  final_video_url: string | null;
  posted_url: string | null;
  posting_meta?: Record<string, unknown> | null;
}

export function getNextAction(video: VideoForAction): NextActionResult {
  const blockers: string[] = [];

  // Check common blockers
  if (!video.product_id) blockers.push('product_missing');
  if (!video.script_locked_text) blockers.push('script_missing');

  // If there are hard blockers, override next action
  if (blockers.length > 0 && video.status !== 'posted' && video.status !== 'archived') {
    return {
      label: 'Fix Blockers',
      action: 'fix_blockers',
      href: `/admin/pipeline/${video.id}`,
      blockers,
    };
  }

  const detailHref = `/admin/video/${video.id}`;

  switch (video.status) {
    case 'draft': {
      // Check recording status
      const rs = video.recording_status;
      if (!rs || rs === 'NOT_RECORDED') {
        return { label: 'Record Now', action: 'record', href: detailHref, blockers };
      }
      if (rs === 'AI_RENDERING') {
        return { label: 'Rendering...', action: 'wait_render', href: detailHref, blockers };
      }
      if (rs === 'RECORDED') {
        return { label: 'Upload Footage', action: 'upload', href: detailHref, blockers };
      }
      if (rs === 'EDITED' || rs === 'READY_FOR_REVIEW') {
        return { label: 'Review Edit', action: 'review_edit', href: detailHref, blockers };
      }
      return { label: 'Continue Draft', action: 'continue_draft', href: detailHref, blockers };
    }

    case 'needs_edit':
      if (!video.google_drive_url) {
        blockers.push('drive_folder_missing');
      }
      return { label: 'Edit Video', action: 'edit', href: detailHref, blockers };

    case 'ready_to_post': {
      const hasCaptionPackage = video.posting_meta &&
        typeof video.posting_meta === 'object' &&
        'caption' in video.posting_meta;
      if (!hasCaptionPackage) {
        return { label: 'Generate Post Package', action: 'generate_post_package', href: detailHref, blockers };
      }
      return { label: 'Post Now', action: 'post', href: detailHref, blockers };
    }

    case 'posted':
      if (!video.posted_url) {
        return { label: 'Add Post URL', action: 'add_post_url', href: detailHref, blockers };
      }
      return { label: 'View Insights', action: 'view_insights', href: detailHref, blockers };

    case 'failed':
      return { label: 'Retry', action: 'retry', href: detailHref, blockers };

    case 'archived':
      return { label: 'Archived', action: 'none', blockers };

    default:
      return { label: 'Open', action: 'open', href: detailHref, blockers };
  }
}

/**
 * Map action types to human-readable action card data for the dashboard.
 */
export function getActionCardConfig(action: string): {
  title: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  switch (action) {
    case 'record':
      return { title: 'Record Next Video', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' };
    case 'upload':
      return { title: 'Upload Footage', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' };
    case 'edit':
      return { title: 'Edit Video', color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' };
    case 'review_edit':
      return { title: 'Approve Edit', color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20' };
    case 'generate_post_package':
      return { title: 'Generate Post Package', color: 'text-teal-400', bgColor: 'bg-teal-500/10', borderColor: 'border-teal-500/20' };
    case 'post':
      return { title: 'Post Today', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' };
    case 'fix_blockers':
      return { title: 'Fix Blockers', color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20' };
    default:
      return { title: 'Continue', color: 'text-zinc-400', bgColor: 'bg-zinc-500/10', borderColor: 'border-zinc-500/20' };
  }
}
