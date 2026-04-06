'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { StageChip } from '@/components/ui/StageChip';
import { StepProgress } from '@/components/ui/StepProgress';
import { getUIStage, STAGE_CONFIGS } from '@/lib/ui/stages';

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
      title="Video Details"
      size="large"
      stickyFooter={
        <div className="flex gap-3">
          {onReject && (
            <button type="button"
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
            <button type="button"
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

      {/* Status & Progress */}
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <StageChip recordingStatus={video.workflow} size="md" />
            {video.brand && (
              <span className="text-xs text-zinc-500">{video.brand}</span>
            )}
          </div>
          {(() => {
            const stage = getUIStage(video.workflow, null);
            const config = STAGE_CONFIGS[stage];
            return <p className="text-sm text-zinc-400">{config.description}</p>;
          })()}
          <StepProgress recordingStatus={video.workflow} />
        </div>

        <div>
          <h3 className="text-base font-medium text-white mb-1">{video.title || 'Untitled'}</h3>
          {video.assignedTo && (
            <p className="text-xs text-zinc-500">Assigned to {video.assignedTo}</p>
          )}
        </div>

        {video.script && (
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Script</label>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap bg-zinc-800 rounded-lg p-3 max-h-48 overflow-auto">
              {video.script}
            </p>
          </div>
        )}

        {video.notes && (
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Notes</label>
            <p className="text-sm text-zinc-300">{video.notes}</p>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

