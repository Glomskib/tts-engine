'use client';

import { MoreHorizontal } from 'lucide-react';

interface Video {
  id: string;
  title?: string;
  thumbnail?: string;
  brand?: string;
  workflow: string;
  assignedTo?: string;
  updatedAt?: string;
}

interface VideoQueueMobileProps {
  videos: Video[];
  onVideoClick: (video: Video) => void;
}

export function VideoQueueMobile({ videos, onVideoClick }: VideoQueueMobileProps) {
  return (
    <div className="flex flex-col gap-3 lg:hidden px-4 pb-24">
      {videos.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p className="text-base">No videos in queue</p>
        </div>
      ) : (
        videos.map((video) => (
          <div
            key={video.id}
            onClick={() => onVideoClick(video)}
            className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 active:bg-zinc-800 transition-colors cursor-pointer"
          >
            {/* Top row: thumbnail + title + status */}
            <div className="flex gap-3 mb-3">
              {video.thumbnail ? (
                <img
                  src={video.thumbnail}
                  alt={`Thumbnail for ${video.title || 'video'}`}
                  className="w-20 h-12 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-12 rounded-lg bg-zinc-800 flex-shrink-0 flex items-center justify-center">
                  <span className="text-zinc-600 text-xs">No preview</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-[15px] text-white truncate">
                  {video.title || video.id}
                </h3>
                <p className="text-sm text-zinc-500 truncate">
                  {video.brand || 'No brand'}
                </p>
              </div>
            </div>

            {/* Status badge + metadata */}
            <div className="flex items-center justify-between mb-3">
              <StatusBadge status={video.workflow} />
              {video.updatedAt && (
                <span className="text-xs text-zinc-500">
                  {formatRelativeTime(video.updatedAt)}
                </span>
              )}
            </div>

            {/* Action buttons - FULL WIDTH, STACKED */}
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onVideoClick(video);
                }}
                className="
                  flex-1 h-12 rounded-lg font-medium text-[15px]
                  bg-teal-600 text-white active:bg-teal-700
                "
              >
                Review
              </button>
              <button
                onClick={(e) => e.stopPropagation()}
                className="
                  h-12 w-12 rounded-lg border border-zinc-700
                  flex items-center justify-center
                  active:bg-zinc-800
                "
              >
                <MoreHorizontal className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'Ready to Record': 'bg-blue-500/20 text-blue-400',
    'ready_to_record': 'bg-blue-500/20 text-blue-400',
    'Needs Review': 'bg-amber-500/20 text-amber-400',
    'needs_review': 'bg-amber-500/20 text-amber-400',
    'Approved': 'bg-green-500/20 text-green-400',
    'approved': 'bg-green-500/20 text-green-400',
    'Rejected': 'bg-red-500/20 text-red-400',
    'rejected': 'bg-red-500/20 text-red-400',
    'In Progress': 'bg-purple-500/20 text-purple-400',
    'in_progress': 'bg-purple-500/20 text-purple-400',
  };

  const displayStatus = status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <span className={`
      px-3 py-1.5 rounded-full text-xs font-medium
      ${styles[status] || 'bg-zinc-700 text-zinc-300'}
    `}>
      {displayStatus}
    </span>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
