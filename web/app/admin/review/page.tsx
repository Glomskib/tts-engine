'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/contexts/ToastContext';
import AdminPageLayout, { StatCard } from '../components/AdminPageLayout';
import { CheckCircle, XCircle, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface ReviewVideo {
  id: string;
  video_code: string | null;
  recording_status: string | null;
  final_video_url?: string | null;
  script_locked_text: string | null;
  brand_name?: string | null;
  product_name?: string | null;
  product_category?: string | null;
  last_status_changed_at: string | null;
  created_at: string;
}

const REJECT_REASONS = [
  { code: 'bad_visuals', label: 'Bad Visuals' },
  { code: 'wrong_pacing', label: 'Wrong Pacing' },
  { code: 'audio_issues', label: 'Audio Issues' },
  { code: 'off_brand', label: 'Off Brand' },
  { code: 'wrong_product', label: 'Wrong Product' },
  { code: 'text_overlay', label: 'Text Overlay Issues' },
  { code: 'compliance', label: 'Compliance Issue' },
  { code: 'other', label: 'Other' },
];

export default function ReviewPage() {
  const { showSuccess, showError } = useToast();

  const [videos, setVideos] = useState<ReviewVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Reject modal state
  const [rejectVideoId, setRejectVideoId] = useState<string | null>(null);
  const [selectedRejectCode, setSelectedRejectCode] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  // Approve notes state
  const [showApproveNotes, setShowApproveNotes] = useState<Record<string, boolean>>({});
  const [approveNotes, setApproveNotes] = useState<Record<string, string>>({});

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/videos/queue?recording_status=READY_FOR_REVIEW&claimed=any&limit=50');
      if (res.ok) {
        const data = await res.json();
        setVideos(data.data || []);
      }
    } catch {
      showError('Failed to load videos');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const handleApprove = useCallback(async (videoId: string) => {
    setActionLoading(videoId);
    try {
      const notes = approveNotes[videoId]?.trim() || undefined;
      const res = await fetch(`/api/admin/videos/${videoId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', notes }),
      });
      if (res.ok) {
        showSuccess('Video approved — moved to posting queue');
        setVideos((prev) => {
          const next = prev.filter((v) => v.id !== videoId);
          setActiveIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
          return next;
        });
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error?.message || err.message || 'Failed to approve');
      }
    } catch {
      showError('Network error');
    } finally {
      setActionLoading(null);
    }
  }, [approveNotes, showSuccess, showError]);

  const handleReject = async () => {
    if (!rejectVideoId || !selectedRejectCode) return;
    setActionLoading(rejectVideoId);
    try {
      const reasonLabel = REJECT_REASONS.find((r) => r.code === selectedRejectCode)?.label || selectedRejectCode;
      const reason = selectedRejectCode === 'other' && rejectNotes.trim()
        ? rejectNotes.trim()
        : reasonLabel;

      const res = await fetch(`/api/admin/videos/${rejectVideoId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          reason,
          notes: rejectNotes.trim() || undefined,
        }),
      });
      if (res.ok) {
        showSuccess('Video rejected');
        setVideos((prev) => {
          const next = prev.filter((v) => v.id !== rejectVideoId);
          setActiveIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
          return next;
        });
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error?.message || err.message || 'Failed to reject');
      }
    } catch {
      showError('Network error');
    } finally {
      setActionLoading(null);
      setRejectVideoId(null);
      setSelectedRejectCode(null);
      setRejectNotes('');
    }
  };

  const getTimeAgo = (dateStr: string | null, fallback?: string) => {
    const d = dateStr || fallback;
    if (!d) return '';
    const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // Scroll active card into view
  useEffect(() => {
    const el = cardRefs.current[activeIndex];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (rejectVideoId) {
        if (e.key === 'Escape') {
          setRejectVideoId(null);
          setSelectedRejectCode(null);
          setRejectNotes('');
        }
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (videos.length === 0 || actionLoading) return;

      switch (e.key) {
        case 'a':
        case 'A': {
          e.preventDefault();
          const video = videos[activeIndex];
          if (video) handleApprove(video.id);
          break;
        }
        case 'r':
        case 'R': {
          e.preventDefault();
          const video = videos[activeIndex];
          if (video) {
            setRejectVideoId(video.id);
            setSelectedRejectCode(null);
            setRejectNotes('');
          }
          break;
        }
        case 'ArrowUp':
        case 'ArrowLeft': {
          e.preventDefault();
          setActiveIndex((i) => Math.max(0, i - 1));
          break;
        }
        case 'ArrowDown':
        case 'ArrowRight': {
          e.preventDefault();
          setActiveIndex((i) => Math.min(videos.length - 1, i + 1));
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [videos, activeIndex, actionLoading, rejectVideoId, handleApprove]);

  return (
    <AdminPageLayout
      title="Video Review"
      subtitle={
        videos.length > 0
          ? `${videos.length} video${videos.length !== 1 ? 's' : ''} awaiting review`
          : 'Approve or reject AI-generated videos'
      }
      headerActions={
        <button
          onClick={() => fetchVideos()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-800 text-zinc-100 border border-white/10 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard
          label="Pending Review"
          value={videos.length}
          variant={videos.length > 0 ? 'warning' : 'default'}
        />
        {videos.length > 0 && (
          <StatCard
            label="Reviewing"
            value={`${activeIndex + 1} of ${videos.length}`}
            variant="default"
          />
        )}
      </div>

      {/* Keyboard hints */}
      {!loading && videos.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
          <span>
            <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-[11px]">A</kbd>{' '}
            Approve
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-[11px]">R</kbd>{' '}
            Reject
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-[11px]">
              &uarr;&darr;
            </kbd>{' '}
            Navigate
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          <span className="ml-3 text-zinc-500">Loading videos...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && videos.length === 0 && (
        <div className="py-16 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-lg font-medium text-zinc-100 mb-1">All caught up</h3>
          <p className="text-sm text-zinc-500">No videos pending review right now.</p>
        </div>
      )}

      {/* Video grid — 2 columns on desktop */}
      {!loading && videos.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {videos.map((video, index) => {
            const isActive = index === activeIndex;
            const isActioning = actionLoading === video.id;

            return (
              <div
                key={video.id}
                ref={(el) => {
                  cardRefs.current[index] = el;
                }}
                onClick={() => setActiveIndex(index)}
                className={`bg-zinc-900/50 rounded-xl overflow-hidden cursor-pointer transition-all ${
                  isActive
                    ? 'ring-2 ring-emerald-500/60 border border-emerald-500/30'
                    : 'border border-white/10 hover:border-white/20'
                }`}
              >
                {/* Video player */}
                <div className="aspect-[9/16] max-h-[480px] bg-black relative">
                  {video.final_video_url ? (
                    <video
                      src={video.final_video_url}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm">
                      No video URL available
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-100">
                        {video.product_name || 'Unknown Product'}
                      </h3>
                      <p className="text-sm text-zinc-500">
                        {[video.brand_name, video.product_category].filter(Boolean).join(' / ')}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-600 whitespace-nowrap">
                      {getTimeAgo(video.last_status_changed_at, video.created_at)}
                    </span>
                  </div>

                  {video.video_code && (
                    <div className="text-[11px] text-zinc-600 font-mono">{video.video_code}</div>
                  )}

                  {/* Script text */}
                  {video.script_locked_text && (
                    <details className="group">
                      <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400 select-none">
                        View script
                      </summary>
                      <pre className="mt-2 text-xs text-zinc-400 whitespace-pre-wrap bg-zinc-800/50 rounded-lg p-3 max-h-40 overflow-y-auto font-mono">
                        {video.script_locked_text}
                      </pre>
                    </details>
                  )}

                  {/* Approve notes toggle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowApproveNotes((prev) => ({ ...prev, [video.id]: !prev[video.id] }));
                    }}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-400"
                  >
                    {showApproveNotes[video.id] ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    Add notes
                  </button>
                  {showApproveNotes[video.id] && (
                    <textarea
                      value={approveNotes[video.id] || ''}
                      onChange={(e) =>
                        setApproveNotes((prev) => ({ ...prev, [video.id]: e.target.value }))
                      }
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Optional notes (saved on approve)..."
                      className="w-full px-3 py-2 text-sm bg-zinc-800 border border-white/10 rounded-lg text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
                      rows={2}
                    />
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(video.id);
                      }}
                      disabled={isActioning}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isActioning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRejectVideoId(video.id);
                        setSelectedRejectCode(null);
                        setRejectNotes('');
                      }}
                      disabled={isActioning}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject modal */}
      {rejectVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setRejectVideoId(null)} />
          <div
            className="relative bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Reject Video</h3>
            <p className="text-sm text-zinc-500">Select a reason for rejecting this video:</p>

            {/* Reject reason tags */}
            <div className="flex flex-wrap gap-2">
              {REJECT_REASONS.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() =>
                    setSelectedRejectCode(r.code === selectedRejectCode ? null : r.code)
                  }
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    selectedRejectCode === r.code
                      ? 'bg-red-500/20 text-red-400 border-red-500/40'
                      : 'bg-white/5 text-zinc-300 border-white/10 hover:border-white/20'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Notes textarea */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Notes{' '}
                {selectedRejectCode === 'other' && <span className="text-red-400">*</span>}
              </label>
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Additional details, instructions for re-render..."
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-white/10 rounded-lg text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-red-500"
                rows={3}
              />
            </div>

            {/* Modal actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRejectVideoId(null);
                  setSelectedRejectCode(null);
                  setRejectNotes('');
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-zinc-800 text-zinc-300 border border-white/10 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={
                  !selectedRejectCode ||
                  actionLoading !== null ||
                  (selectedRejectCode === 'other' && !rejectNotes.trim())
                }
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}
