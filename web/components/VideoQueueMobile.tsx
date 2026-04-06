'use client';

import { ChevronRight } from 'lucide-react';
import { getUIStage, STAGE_CONFIGS } from '@/lib/ui/stages';

interface Video {
  id: string;
  title?: string;
  brand?: string;
  workflow: string;
  recording_status?: string | null;
  updatedAt?: string;
  nextAction?: string;
  nextActionClass?: string;
  // kept for backward compat — ignored in simplified view
  hasScript?: boolean;
  assignedTo?: string;
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
        <p className="text-base">Nothing here yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 lg:hidden">
      {videos.map((video) => {
        const stage = getUIStage(video.recording_status ?? video.workflow, null);
        const stageConfig = STAGE_CONFIGS[stage];

        return (
          <div
            key={video.id}
            onClick={() => onVideoClick(video)}
            className="relative bg-zinc-900 rounded-xl border border-zinc-800 transition-colors cursor-pointer active:bg-zinc-800/80"
          >
            <div className="px-4 py-3.5">
              {/* Row 1: Title + age */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-medium text-[14px] text-white leading-snug line-clamp-2 flex-1 min-w-0">
                  {video.title || video.id.slice(0, 8)}
                </h3>
                {video.updatedAt && (
                  <span className="text-[11px] text-zinc-600 tabular-nums shrink-0 mt-0.5">
                    {formatRelativeTime(video.updatedAt)}
                  </span>
                )}
              </div>

              {/* Row 2: Stage chip + action button */}
              <div className="flex items-center justify-between gap-2">
                {/* Stage chip */}
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${stageConfig.bg} ${stageConfig.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${stageConfig.dot} shrink-0`} />
                  {stageConfig.label}
                </span>

                <div className="flex items-center gap-2">
                  {/* Primary action button */}
                  {video.nextAction && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrimaryAction?.(video);
                      }}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-colors min-h-[36px] ${video.nextActionClass || 'bg-teal-600 hover:bg-teal-500 text-white'}`}
                    >
                      {video.nextAction}
                    </button>
                  )}

                  <ChevronRight className="w-4 h-4 text-zinc-700 shrink-0" />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
