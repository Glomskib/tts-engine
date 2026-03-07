'use client';

import { useHydrated, formatDateString } from '@/lib/useHydrated';

interface TimelineItem {
  ts: string;
  type: 'event' | 'assignment' | 'video_snapshot';
  label: string;
  metadata: Record<string, unknown>;
}

interface VideoTimestamps {
  created_at?: string | null;
  recorded_at?: string | null;
  edited_at?: string | null;
  ready_to_post_at?: string | null;
  posted_at?: string | null;
  rejected_at?: string | null;
  last_status_changed_at?: string | null;
}

interface VideoTimelineProps {
  items: TimelineItem[];
  timestamps?: VideoTimestamps;
}

const TYPE_CONFIG: Record<string, { dot: string; line: string; badge: string }> = {
  event:          { dot: 'bg-blue-500',    line: 'border-blue-500/20',    badge: 'bg-blue-500/10 text-blue-400' },
  assignment:     { dot: 'bg-emerald-500', line: 'border-emerald-500/20', badge: 'bg-emerald-500/10 text-emerald-400' },
  video_snapshot: { dot: 'bg-amber-500',   line: 'border-amber-500/20',   badge: 'bg-amber-500/10 text-amber-400' },
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildMilestones(timestamps: VideoTimestamps): TimelineItem[] {
  const milestones: TimelineItem[] = [];
  if (timestamps.created_at) {
    milestones.push({ ts: timestamps.created_at, type: 'event', label: 'Video created', metadata: {} });
  }
  if (timestamps.recorded_at) {
    milestones.push({ ts: timestamps.recorded_at, type: 'event', label: 'Recording completed', metadata: {} });
  }
  if (timestamps.edited_at) {
    milestones.push({ ts: timestamps.edited_at, type: 'event', label: 'Editing completed', metadata: {} });
  }
  if (timestamps.ready_to_post_at) {
    milestones.push({ ts: timestamps.ready_to_post_at, type: 'event', label: 'Ready to post', metadata: {} });
  }
  if (timestamps.posted_at) {
    milestones.push({ ts: timestamps.posted_at, type: 'event', label: 'Posted', metadata: {} });
  }
  if (timestamps.rejected_at) {
    milestones.push({ ts: timestamps.rejected_at, type: 'event', label: 'Rejected', metadata: {} });
  }
  return milestones;
}

export function VideoTimeline({ items, timestamps }: VideoTimelineProps) {
  const hydrated = useHydrated();

  // Merge API timeline items with milestone timestamps, deduplicate by label+time proximity
  let allItems = [...items];
  if (timestamps) {
    const milestones = buildMilestones(timestamps);
    for (const ms of milestones) {
      const hasSimilar = allItems.some(item =>
        item.label.toLowerCase().includes(ms.label.toLowerCase().split(' ')[0]) &&
        Math.abs(new Date(item.ts).getTime() - new Date(ms.ts).getTime()) < 60000
      );
      if (!hasSimilar) allItems.push(ms);
    }
  }

  // Sort newest first
  allItems.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  if (allItems.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No timeline events yet
      </div>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto">
      <div className="border-l-2 border-white/10 pl-4 space-y-0 ml-2">
        {allItems.map((item, idx) => {
          const eventType = (item.metadata?.event_type as string) || '';
          let displayType = item.type;
          if (eventType.includes('email') || eventType.includes('slack') || eventType.startsWith('admin_')) {
            displayType = 'event';
          }
          const config = TYPE_CONFIG[displayType] || TYPE_CONFIG.event;
          const isFirst = idx === 0;

          return (
            <div key={`${item.ts}-${idx}`} className="relative pb-4 last:pb-0">
              {/* Timeline dot */}
              <span className={`absolute -left-[calc(1rem+5px)] w-2.5 h-2.5 rounded-full ${config.dot} ${isFirst ? 'ring-2 ring-offset-1 ring-offset-zinc-900 ring-current' : ''}`} />

              {/* Content */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${config.badge}`}>
                    {item.type}
                  </span>
                  <span className="text-[11px] text-zinc-500 tabular-nums whitespace-nowrap">
                    {hydrated ? formatTimeAgo(item.ts) : formatDateString(item.ts)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-300 leading-snug">{item.label}</div>
                  {item.metadata && Object.keys(item.metadata).length > 0 && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300">Details</summary>
                      <pre className="mt-1 text-[10px] text-zinc-500 font-mono bg-zinc-800/30 rounded p-2 overflow-auto max-h-24">
                        {JSON.stringify(item.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
