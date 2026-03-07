/**
 * Determine the single "Next Action" for a content item based on its
 * current status and what data is missing.
 *
 * Used by Studio, Pipeline cards, ContentItemPanel, and mobile UX
 * to show ONE primary CTA per item.
 */

import type { ContentItemStatus } from './types';

export interface NextAction {
  /** Button label, e.g. "Record" */
  label: string;
  /** Navigation href if this is a link action */
  href?: string;
  /** Callback type for non-link actions (handled by the caller) */
  onClickType?: 'generate_brief' | 'generate_editor_notes' | 'mark_ready_to_post' | 'link_product' | 'paste_transcript' | 'log_metrics';
  /** Short explanation shown as tooltip or subtitle */
  reason?: string;
  /** Tailwind color class for the button */
  variant: 'teal' | 'green' | 'violet' | 'amber' | 'blue' | 'zinc';
}

export interface ContentItemForAction {
  id: string;
  status: ContentItemStatus;
  product_id?: string | null;
  drive_folder_id?: string | null;
  transcript_text?: string | null;
  editor_notes?: unknown;
  editor_notes_status?: string | null;
  final_video_url?: string | null;
  caption?: string | null;
  /** Whether a brief exists */
  has_brief?: boolean;
}

/**
 * Returns the single most important next action for a content item.
 *
 * Priority order:
 * 1. Missing product (if status > briefing)
 * 2. Status-specific action
 * 3. Missing requirements for current stage
 */
export function getNextAction(item: ContentItemForAction): NextAction {
  const { status, id } = item;

  // Missing product override (only if past briefing)
  if (!item.product_id && status !== 'briefing' && status !== 'posted') {
    return {
      label: 'Link Product',
      onClickType: 'link_product',
      reason: 'Assign a product before continuing',
      variant: 'amber',
    };
  }

  switch (status) {
    case 'briefing':
      if (item.has_brief) {
        return {
          label: 'Review Brief',
          href: `/admin/record/${id}`,
          reason: 'Brief exists — review and advance',
          variant: 'teal',
        };
      }
      return {
        label: 'Generate Brief',
        onClickType: 'generate_brief',
        reason: 'Create a creator brief to start',
        variant: 'teal',
      };

    case 'ready_to_record':
      return {
        label: 'Record',
        href: `/admin/record/${id}`,
        reason: 'Open Recording Kit',
        variant: 'teal',
      };

    case 'recorded':
      // Missing transcript override
      if (!item.transcript_text) {
        return {
          label: 'Paste Transcript',
          onClickType: 'paste_transcript',
          reason: 'Add transcript before editing',
          variant: 'violet',
        };
      }
      if (item.editor_notes_status === 'completed' && item.editor_notes) {
        return {
          label: 'Review Editor Notes',
          href: `/admin/record/${id}`,
          reason: 'Editor notes ready — review them',
          variant: 'blue',
        };
      }
      return {
        label: 'Generate Editor Notes',
        onClickType: 'generate_editor_notes',
        reason: 'AI will create editing instructions',
        variant: 'violet',
      };

    case 'editing':
      if (item.final_video_url) {
        return {
          label: 'Mark Ready to Post',
          onClickType: 'mark_ready_to_post',
          reason: 'Final video uploaded — advance to posting',
          variant: 'green',
        };
      }
      return {
        label: 'Mark Ready to Post',
        onClickType: 'mark_ready_to_post',
        reason: 'Move to posting when editing is done',
        variant: 'green',
      };

    case 'ready_to_post':
      return {
        label: 'Post',
        href: `/admin/post/${id}`,
        reason: 'Open posting flow',
        variant: 'green',
      };

    case 'posted':
      return {
        label: 'Log Metrics',
        onClickType: 'log_metrics',
        reason: 'Track performance data',
        variant: 'zinc',
      };

    default:
      return {
        label: 'View',
        href: `/admin/record/${id}`,
        variant: 'zinc',
      };
  }
}

/**
 * Get the Tailwind classes for a NextAction variant.
 */
export function getActionButtonClasses(variant: NextAction['variant']): string {
  const map: Record<NextAction['variant'], string> = {
    teal: 'bg-teal-600 text-white active:bg-teal-700',
    green: 'bg-green-600 text-white active:bg-green-700',
    violet: 'bg-violet-600 text-white active:bg-violet-700',
    amber: 'bg-amber-600 text-white active:bg-amber-700',
    blue: 'bg-blue-600 text-white active:bg-blue-700',
    zinc: 'bg-zinc-800 text-zinc-200 active:bg-zinc-700',
  };
  return map[variant];
}
