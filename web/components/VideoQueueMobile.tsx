'use client';

import { Clock, FileText, User, AlertTriangle, ChevronRight } from 'lucide-react';
import { getStatusConfig, formatStatusLabel } from '@/lib/status';

interface Video {
  id: string;
  title?: string;
  thumbnail?: string;
  brand?: string;
  workflow: string;
  assignedTo?: string;
  updatedAt?: string;
  // Rich fields for pipeline cards
  hasScript?: boolean;
  nextAction?: string;
  slaStatus?: 'on_track' | 'due_soon' | 'overdue' | 'no_due_date';
  blockedReason?: string | null;
  claimedByMe?: boolean;
}

interface VideoQueueMobileProps {
  videos: Video[];
  onVideoClick: (video: Video) => void;
  onPrimaryAction?: (video: Video) => void;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function VideoQueueMobile({ videos, onVideoClick, onPrimaryAction }: VideoQueueMobileProps) {
  if (videos.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p className="text-base">No videos in queue</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 lg:hidden">
      {videos.map((video) => {
        const status = video.workflow || 'NOT_RECORDED';
        const styles = getStatusConfig(status);
        const label = formatStatusLabel(status);
        const isStale = video.slaStatus === 'overdue';
        const isDueSoon = video.slaStatus === 'due_soon';
        const isBlocked = !!video.blockedReason;

        return (
          <div
            key={video.id}
            onClick={() => onVideoClick(video)}
            className={`
              relative bg-zinc-900 rounded-xl border transition-colors cursor-pointer active:bg-zinc-800/80
              ${isStale ? 'border-red-500/30 bg-red-500/[0.03]' : isDueSoon ? 'border-amber-500/20' : 'border-zinc-800'}
            `}
          >
            {/* Stale indicator - left accent bar */}
            {isStale && (
              <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-red-500" />
            )}
            {isDueSoon && !isStale && (
              <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-amber-500" />
            )}

            <div className={`px-4 py-3 ${isStale || isDueSoon ? 'pl-5' : ''}`}>
              {/* Row 1: Title + Age */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-medium text-[14px] text-white leading-tight line-clamp-2 flex-1 min-w-0">
                  {video.title || video.id.slice(0, 8)}
                </h3>
                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  {video.updatedAt && (
                    <span className={`text-[11px] tabular-nums ${isStale ? 'text-red-400 font-medium' : 'text-zinc-500'}`}>
                      {formatRelativeTime(video.updatedAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Row 2: Status + Script + Owner badges */}
              <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                {/* Status badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${styles.bg} ${styles.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
                  {label}
                </span>

                {/* Script indicator */}
                {video.hasScript === false && status !== 'NEEDS_SCRIPT' && status !== 'GENERATING_SCRIPT' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-amber-500/10 text-amber-400">
                    <FileText className="w-3 h-3" />
                    No Script
                  </span>
                )}
                {video.hasScript && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] bg-teal-500/10 text-teal-400">
                    <FileText className="w-3 h-3" />
                  </span>
                )}

                {/* Owner */}
                {video.assignedTo && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] ${video.claimedByMe ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-400'}`}>
                    <User className="w-3 h-3" />
                    {video.claimedByMe ? 'You' : video.assignedTo.slice(0, 8)}
                  </span>
                )}

                {/* Brand */}
                {video.brand && (
                  <span className="text-[11px] text-zinc-500 truncate max-w-[100px]">
                    {video.brand}
                  </span>
                )}
              </div>

              {/* Row 3: Next action + blocked reason + chevron */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isBlocked && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span className="truncate">{video.blockedReason}</span>
                    </span>
                  )}
                  {!isBlocked && video.nextAction && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrimaryAction?.(video);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-teal-600/20 text-teal-400 active:bg-teal-600/30 transition-colors"
                    >
                      {video.nextAction}
                    </button>
                  )}
                  {isStale && !isBlocked && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-red-400 font-medium">
                      <Clock className="w-3 h-3" />
                      Overdue
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
