'use client';

import { BottomSheet } from './BottomSheet';

interface Video {
  id: string;
  title?: string;
  thumbnail?: string;
  brand?: string;
  workflow: string;
  assignedTo?: string;
  script?: string;
  notes?: string;
}

interface VideoDetailSheetProps {
  video: Video | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: (video: Video) => void;
  onReject?: (video: Video) => void;
}

export function VideoDetailSheet({
  video,
  isOpen,
  onClose,
  onApprove,
  onReject,
}: VideoDetailSheetProps) {
  if (!video) return null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Review Video"
      size="large"
      stickyFooter={
        <div className="flex gap-3">
          {onReject && (
            <button
              onClick={() => onReject(video)}
              className="
                flex-1 h-14 rounded-xl font-semibold text-base
                border-2 border-red-500/50 text-red-400
                active:bg-red-500/20
              "
            >
              Reject
            </button>
          )}
          {onApprove && (
            <button
              onClick={() => onApprove(video)}
              className="
                flex-1 h-14 rounded-xl font-semibold text-base
                bg-teal-600 text-white
                active:bg-teal-700
              "
            >
              Approve
            </button>
          )}
        </div>
      }
    >
      {/* Video preview */}
      <div className="aspect-video bg-zinc-800 rounded-xl mb-4 overflow-hidden">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            No preview
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="space-y-4">
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-wide">Title</label>
          <p className="text-base text-white mt-1">{video.title || 'Untitled'}</p>
        </div>

        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-wide">Brand / Product</label>
          <p className="text-base text-white mt-1">{video.brand || '—'}</p>
        </div>

        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-wide">Status</label>
          <div className="mt-1">
            <StatusBadge status={video.workflow} />
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-wide">Assigned To</label>
          <p className="text-base text-white mt-1">{video.assignedTo || 'Unassigned'}</p>
        </div>

        {video.script && (
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide">Script</label>
            <p className="text-base text-white mt-1 whitespace-pre-wrap bg-zinc-800 rounded-lg p-3">
              {video.script}
            </p>
          </div>
        )}

        {video.notes && (
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide">Notes</label>
            <p className="text-base text-white mt-1">{video.notes}</p>
          </div>
        )}
      </div>
    </BottomSheet>
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
  };

  const displayStatus = status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <span className={`
      inline-block px-3 py-1.5 rounded-full text-xs font-medium
      ${styles[status] || 'bg-zinc-700 text-zinc-300'}
    `}>
      {displayStatus}
    </span>
  );
}
