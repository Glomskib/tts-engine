'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
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
  onApprove?: (video: Video) => Promise<void> | void;
  onReject?: (video: Video) => Promise<void> | void;
}

export function VideoDetailSheet({
  video,
  isOpen,
  onClose,
  onApprove,
  onReject,
}: VideoDetailSheetProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  if (!video) return null;

  const handleApprove = async () => {
    if (!onApprove || isApproving || isRejecting) return;
    setIsApproving(true);
    try {
      await onApprove(video);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!onReject || isApproving || isRejecting) return;
    setIsRejecting(true);
    try {
      await onReject(video);
    } finally {
      setIsRejecting(false);
    }
  };

  const isLoading = isApproving || isRejecting;

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
              onClick={handleReject}
              disabled={isLoading}
              className={`
                flex-1 h-14 rounded-xl font-semibold text-base
                border-2 border-red-500/50 text-red-400
                active:bg-red-500/20 transition-opacity
                flex items-center justify-center gap-2
                ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {isRejecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Rejecting...
                </>
              ) : (
                'Reject'
              )}
            </button>
          )}
          {onApprove && (
            <button
              onClick={handleApprove}
              disabled={isLoading}
              className={`
                flex-1 h-14 rounded-xl font-semibold text-base
                bg-teal-600 text-white
                active:bg-teal-700 transition-opacity
                flex items-center justify-center gap-2
                ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {isApproving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Approving...
                </>
              ) : (
                'Approve'
              )}
            </button>
          )}
        </div>
      }
    >
      {/* Video preview */}
      <div className="aspect-video bg-zinc-800 rounded-xl mb-4 overflow-hidden">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={`Preview for ${video.title || 'video'}`} className="w-full h-full object-cover" />
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
