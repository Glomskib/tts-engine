'use client';

import { useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ExternalLink, Check, SkipForward } from 'lucide-react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { ShortcutBadge } from '@/hooks/useKeyboardShortcuts';

// ── Types ──────────────────────────────────────────────────────────────────

export interface EditingSessionVideo {
  id: string;
  video_code: string | null;
  recording_status: string | null;
  script_locked_text: string | null;
  brand_name?: string;
  product_name?: string;
  google_drive_url: string;
  final_video_url?: string | null;
  blocked_reason: string | null;
  can_mark_edited: boolean;
}

interface EditingSessionViewProps {
  videos: EditingSessionVideo[];
  onClose: () => void;
  onMarkEdited: (videoId: string) => Promise<void>;
  onMarkReadyToPost: (videoId: string) => Promise<void>;
  onRefresh: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getDisplayTitle(v: EditingSessionVideo): string {
  if (v.brand_name && v.product_name) {
    let seq = '';
    if (v.video_code) {
      const m = v.video_code.match(/-(\\d{3})$/);
      if (m) seq = ` #${parseInt(m[1], 10)}`;
    }
    return `${v.brand_name} — ${v.product_name}${seq}`;
  }
  return v.video_code || v.id.slice(0, 8);
}

// ── Component ──────────────────────────────────────────────────────────────

export function EditingSessionView({
  videos,
  onClose,
  onMarkEdited,
  onMarkReadyToPost,
  onRefresh,
}: EditingSessionViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const total = videos.length;
  const video = videos[currentIndex];

  // Navigation
  const goNext = useCallback(() => {
    if (currentIndex < total - 1) setCurrentIndex(i => i + 1);
  }, [currentIndex, total]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  // Actions
  const handleMarkEdited = useCallback(async () => {
    if (!video || actionLoading) return;
    setActionLoading(true);
    try {
      await onMarkEdited(video.id);
      setCompletedIds(prev => new Set(prev).add(video.id));
      if (currentIndex < total - 1) setCurrentIndex(i => i + 1);
    } finally {
      setActionLoading(false);
    }
  }, [video, actionLoading, onMarkEdited, currentIndex, total]);

  const handleMarkReadyToPost = useCallback(async () => {
    if (!video || actionLoading) return;
    setActionLoading(true);
    try {
      await onMarkReadyToPost(video.id);
      setCompletedIds(prev => new Set(prev).add(video.id));
      if (currentIndex < total - 1) setCurrentIndex(i => i + 1);
    } finally {
      setActionLoading(false);
    }
  }, [video, actionLoading, onMarkReadyToPost, currentIndex, total]);

  const handleSkip = useCallback(() => {
    if (!video) return;
    setSkippedIds(prev => new Set(prev).add(video.id));
    if (currentIndex < total - 1) setCurrentIndex(i => i + 1);
  }, [video, currentIndex, total]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: 'j', handler: goNext, description: 'Next video' },
    { key: 'k', handler: goPrev, description: 'Previous video' },
    { key: 'e', handler: handleMarkEdited, description: 'Mark edited' },
    { key: 'p', handler: handleMarkReadyToPost, description: 'Mark ready to post' },
    { key: 'Escape', handler: onClose, description: 'Exit session' },
  ]);

  const doneCount = completedIds.size;
  const skipCount = skippedIds.size;

  if (!video) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl mb-3">No videos to edit</div>
          <button onClick={onClose} className="text-sm text-teal-400 hover:text-teal-300">
            Back to pipeline
          </button>
        </div>
      </div>
    );
  }

  const videoStatus = completedIds.has(video.id) ? 'completed' : skippedIds.has(video.id) ? 'skipped' : 'pending';

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Exit session (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <span className="text-sm font-medium text-white">Editing Sprint</span>
            <span className="text-xs text-zinc-500 ml-2 hidden sm:inline">
              {doneCount} edited, {skipCount} skipped
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 tabular-nums mr-1">
            {currentIndex + 1} of {total}
          </span>
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goNext}
            disabled={currentIndex === total - 1}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-zinc-900 shrink-0">
        <div
          className="h-full bg-amber-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Status pill */}
          {videoStatus !== 'pending' && (
            <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium mb-4 ${
              videoStatus === 'completed'
                ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/30'
                : 'bg-zinc-700/50 text-zinc-400 ring-1 ring-zinc-600'
            }`}>
              {videoStatus === 'completed' ? 'Edited' : 'Skipped'}
            </div>
          )}

          {/* Video title */}
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">
            {getDisplayTitle(video)}
          </h2>

          {/* Video code */}
          {video.video_code && (
            <div className="text-xs text-zinc-500 mb-4 font-mono">{video.video_code}</div>
          )}

          {/* Links */}
          <div className="flex flex-wrap gap-2 mb-6">
            {video.google_drive_url && (
              <a
                href={video.google_drive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Raw Footage
              </a>
            )}
            {video.final_video_url && (
              <a
                href={video.final_video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-500/10 text-teal-400 rounded-lg text-sm hover:bg-teal-500/20 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Final Video
              </a>
            )}
          </div>

          {/* Script reference */}
          {video.script_locked_text && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Script Reference</div>
              <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {video.script_locked_text}
              </div>
            </div>
          )}

          {/* Blocked warning */}
          {video.blocked_reason && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
              <span className="text-sm text-red-400">{video.blocked_reason}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={handleSkip}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-600 transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip
          </button>

          {/* Progress dots */}
          <div className="hidden sm:flex items-center gap-1 max-w-[300px] overflow-hidden">
            {videos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => setCurrentIndex(i)}
                className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                  i === currentIndex
                    ? 'bg-amber-400 scale-125'
                    : completedIds.has(v.id)
                    ? 'bg-green-500/60'
                    : skippedIds.has(v.id)
                    ? 'bg-zinc-600'
                    : 'bg-zinc-700 hover:bg-zinc-500'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkEdited}
              disabled={actionLoading || !video.can_mark_edited}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {actionLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Mark Edited
              <ShortcutBadge shortcutKey="E" className="hidden sm:inline-flex ml-1 opacity-60" />
            </button>
            <button
              onClick={handleMarkReadyToPost}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              Ready to Post
              <ShortcutBadge shortcutKey="P" className="hidden sm:inline-flex ml-1 opacity-60" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
