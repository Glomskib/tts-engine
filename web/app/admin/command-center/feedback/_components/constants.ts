import type { FeedbackStatus, FeedbackType } from '@/lib/command-center/feedback-types';

export const STATUS_CONFIG: Record<FeedbackStatus, { label: string; color: string; bg: string }> = {
  new: { label: 'New', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  triaged: { label: 'Triaged', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  in_progress: { label: 'In Progress', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  shipped: { label: 'Shipped', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  rejected: { label: 'Rejected', color: 'text-zinc-500', bg: 'bg-zinc-500/10' },
};

export const TYPE_CONFIG: Record<FeedbackType, { label: string; icon: string; color: string }> = {
  bug: { label: 'Bug', icon: '🐛', color: 'text-red-400' },
  feature: { label: 'Feature', icon: '💡', color: 'text-amber-400' },
  improvement: { label: 'Improvement', icon: '✨', color: 'text-blue-400' },
  support: { label: 'Support', icon: '🙋', color: 'text-teal-400' },
  other: { label: 'Other', icon: '💬', color: 'text-zinc-400' },
};

export const PRIORITY_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: 'P1 Critical', color: 'text-red-400' },
  2: { label: 'P2 High', color: 'text-orange-400' },
  3: { label: 'P3 Medium', color: 'text-amber-400' },
  4: { label: 'P4 Low', color: 'text-zinc-400' },
  5: { label: 'P5 Minimal', color: 'text-zinc-600' },
};

export function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
