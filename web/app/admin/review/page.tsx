'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/contexts/ToastContext';
import AdminPageLayout, { StatCard } from '../components/AdminPageLayout';
import { CheckCircle, XCircle, Loader2, RefreshCw, ChevronDown, ChevronUp, RotateCcw, Star } from 'lucide-react';
import { QUALITY_DIMENSIONS, calculateTotal, type QualityScore } from '@/lib/video-quality-score';

interface ReviewVideo {
  id: string;
  video_code: string | null;
  recording_status: string | null;
  final_video_url?: string | null;
  script_locked_text: string | null;
  brand_name?: string | null;
  product_name?: string | null;
  product_category?: string | null;
  quality_score?: QualityScore | null;
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
  const [selectedRejectCodes, setSelectedRejectCodes] = useState<Set<string>>(new Set());
  const [rejectNotes, setRejectNotes] = useState('');

  // Approve notes state
  const [showApproveNotes, setShowApproveNotes] = useState<Record<string, boolean>>({});
  const [approveNotes, setApproveNotes] = useState<Record<string, string>>({});

  // Quality scoring state
  const [showScoring, setShowScoring] = useState<Record<string, boolean>>({});
  const [scores, setScores] = useState<Record<string, Partial<QualityScore>>>({});
  const [scoreNotes, setScoreNotes] = useState<Record<string, string>>({});

  const getScoreForVideo = (videoId: string): Partial<QualityScore> =>
    scores[videoId] || {
      product_visibility: 3,
      label_legibility: 3,
      prompt_accuracy: 3,
      text_overlay: 3,
      composition: 3,
    };

  const updateScore = (videoId: string, key: string, value: number) => {
    setScores((prev) => ({
      ...prev,
      [videoId]: { ...getScoreForVideo(videoId), [key]: value },
    }));
  };

  const buildQualityScorePayload = (videoId: string): Partial<QualityScore> | undefined => {
    if (!showScoring[videoId]) return undefined;
    const s = getScoreForVideo(videoId);
    const notes = scoreNotes[videoId]?.trim();
    return { ...s, total: calculateTotal(s), ...(notes ? { notes } : {}) };
  };

  // Rejected videos state
  const [rejectedVideos, setRejectedVideos] = useState<ReviewVideo[]>([]);
  const [regenLoading, setRegenLoading] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const [reviewRes, rejectedRes] = await Promise.all([
        fetch('/api/videos/queue?recording_status=READY_FOR_REVIEW&claimed=any&limit=50'),
        fetch('/api/videos/queue?recording_status=REJECTED&claimed=any&limit=20'),
      ]);
      if (reviewRes.ok) {
        const data = await reviewRes.json();
        setVideos(data.data || []);
      }
      if (rejectedRes.ok) {
        const data = await rejectedRes.json();
        setRejectedVideos(data.data || []);
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
      const quality_score = buildQualityScorePayload(videoId);
      const res = await fetch(`/api/admin/videos/${videoId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', notes, quality_score }),
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
  }, [approveNotes, showScoring, scores, scoreNotes, showSuccess, showError]);

  const handleReject = async () => {
    if (!rejectVideoId || selectedRejectCodes.size === 0) return;
    setActionLoading(rejectVideoId);
    try {
      const reasonLabels = REJECT_REASONS
        .filter((r) => selectedRejectCodes.has(r.code))
        .map((r) => r.label);
      const reason = selectedRejectCodes.has('other') && rejectNotes.trim()
        ? [...reasonLabels.filter((l) => l !== 'Other'), rejectNotes.trim()].join(', ')
        : reasonLabels.join(', ');

      const quality_score = buildQualityScorePayload(rejectVideoId);
      const res = await fetch(`/api/admin/videos/${rejectVideoId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          reason,
          notes: rejectNotes.trim() || undefined,
          quality_score,
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
      setSelectedRejectCodes(new Set());
      setRejectNotes('');
    }
  };

  const handleRegenerate = async (videoId: string) => {
    setRegenLoading(videoId);
    try {
      const res = await fetch(`/api/videos/${videoId}/execution`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_status: 'NOT_RECORDED' }),
      });
      const data = await res.json();
      if (data.ok) {
        showSuccess('Video queued for re-generation');
        setRejectedVideos(prev => prev.filter(v => v.id !== videoId));
      } else {
        showError(data.error?.message || 'Failed to re-generate');
      }
    } catch {
      showError('Network error');
    } finally {
      setRegenLoading(null);
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
          setSelectedRejectCodes(new Set());
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
            setSelectedRejectCodes(new Set());
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

                  {/* Quality scoring panel */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowScoring((prev) => ({ ...prev, [video.id]: !prev[video.id] }));
                    }}
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400"
                  >
                    {showScoring[video.id] ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <Star className="w-3 h-3" />
                    )}
                    {showScoring[video.id] ? 'Hide scoring' : 'Score video'}
                    {showScoring[video.id] && (
                      <span className="ml-1 text-teal-400 font-medium">
                        {calculateTotal(getScoreForVideo(video.id))}/25
                      </span>
                    )}
                  </button>
                  {showScoring[video.id] && (
                    <div
                      className="space-y-2 bg-zinc-800/50 rounded-lg p-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {QUALITY_DIMENSIONS.map((dim) => {
                        const current = (getScoreForVideo(video.id)[dim.key] as number) || 3;
                        return (
                          <div key={dim.key} className="space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-400">{dim.label}</span>
                              <span className="text-xs font-mono text-zinc-500">{current}/5</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="range"
                                min={1}
                                max={5}
                                step={1}
                                value={current}
                                onChange={(e) =>
                                  updateScore(video.id, dim.key, parseInt(e.target.value))
                                }
                                className="flex-1 h-1.5 appearance-none bg-zinc-700 rounded-full cursor-pointer accent-teal-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal-500"
                              />
                            </div>
                            <p className="text-[10px] text-zinc-600">{dim.hint}</p>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between pt-1 border-t border-white/5">
                        <span className="text-xs font-medium text-zinc-300">Total</span>
                        <span className="text-sm font-bold text-teal-400">
                          {calculateTotal(getScoreForVideo(video.id))}/25
                        </span>
                      </div>
                      <textarea
                        value={scoreNotes[video.id] || ''}
                        onChange={(e) =>
                          setScoreNotes((prev) => ({ ...prev, [video.id]: e.target.value }))
                        }
                        placeholder="Scoring notes (optional)..."
                        className="w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded-lg text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
                        rows={2}
                      />
                    </div>
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
                        setSelectedRejectCodes(new Set());
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

      {/* Recently Rejected */}
      {!loading && rejectedVideos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-zinc-300">
            Recently Rejected
            <span className="ml-2 text-sm font-normal text-zinc-500">
              {rejectedVideos.length} video{rejectedVideos.length !== 1 ? 's' : ''}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rejectedVideos.map(video => (
              <div
                key={video.id}
                className="bg-zinc-900/50 border border-red-500/20 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200">
                      {video.product_name || 'Unknown Product'}
                    </h4>
                    <p className="text-xs text-zinc-500">
                      {video.brand_name || ''}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded-full">
                    REJECTED
                  </span>
                </div>
                {video.video_code && (
                  <div className="text-[11px] text-zinc-600 font-mono">{video.video_code}</div>
                )}
                <div className="text-xs text-zinc-500">
                  {getTimeAgo(video.last_status_changed_at, video.created_at)}
                </div>
                <button
                  type="button"
                  onClick={() => handleRegenerate(video.id)}
                  disabled={regenLoading === video.id}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 rounded-lg transition-colors disabled:opacity-50"
                >
                  {regenLoading === video.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  Re-generate
                </button>
              </div>
            ))}
          </div>
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
            <p className="text-sm text-zinc-500">Select one or more reasons:</p>

            {/* Reject reason tags — multi-select */}
            <div className="flex flex-wrap gap-2">
              {REJECT_REASONS.map((r) => {
                const selected = selectedRejectCodes.has(r.code);
                return (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() =>
                      setSelectedRejectCodes((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.code)) next.delete(r.code);
                        else next.add(r.code);
                        return next;
                      })
                    }
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                      selected
                        ? 'bg-red-500/20 text-red-400 border-red-500/40'
                        : 'bg-white/5 text-zinc-300 border-white/10 hover:border-white/20'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            {/* Notes textarea */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Notes{' '}
                {selectedRejectCodes.has('other') && <span className="text-red-400">*</span>}
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
                  setSelectedRejectCodes(new Set());
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
                  selectedRejectCodes.size === 0 ||
                  actionLoading !== null ||
                  (selectedRejectCodes.has('other') && !rejectNotes.trim())
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
