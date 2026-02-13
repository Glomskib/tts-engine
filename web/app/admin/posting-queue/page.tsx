'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/contexts/ToastContext';
import AdminPageLayout, { StatCard } from '../components/AdminPageLayout';
import {
  Send, Copy, CheckCircle, Loader2, RefreshCw,
  Calendar, Clock, ArrowUpDown, ExternalLink, Play,
  ChevronDown, ChevronUp,
} from 'lucide-react';

interface QueueVideo {
  id: string;
  video_code: string | null;
  recording_status: string | null;
  final_video_url: string | null;
  google_drive_url: string | null;
  script_locked_text: string | null;
  brand_name: string | null;
  product_name: string | null;
  product_category: string | null;
  last_status_changed_at: string | null;
  posted_at: string | null;
  posted_url: string | null;
  created_at: string;
}

type SortMode = 'oldest' | 'newest' | 'brand';

export default function PostingQueuePage() {
  const { showSuccess, showError } = useToast();

  const [videos, setVideos] = useState<QueueVideo[]>([]);
  const [postedVideos, setPostedVideos] = useState<QueueVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('oldest');

  // Schedule modal
  const [scheduleVideoId, setScheduleVideoId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');

  // Mark posted modal
  const [postVideoId, setPostVideoId] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState('');

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const [readyRes, postedRes] = await Promise.all([
        fetch('/api/videos/queue?recording_status=READY_TO_POST&claimed=any&limit=100&sort=oldest'),
        fetch('/api/videos/queue?recording_status=POSTED&claimed=any&limit=20'),
      ]);
      if (readyRes.ok) {
        const data = await readyRes.json();
        setVideos(data.data || []);
      }
      if (postedRes.ok) {
        const data = await postedRes.json();
        setPostedVideos(data.data || []);
      }
    } catch {
      showError('Failed to load posting queue');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const sortedVideos = [...videos].sort((a, b) => {
    if (sortMode === 'brand') {
      const brandA = (a.brand_name || '').toLowerCase();
      const brandB = (b.brand_name || '').toLowerCase();
      if (brandA !== brandB) return brandA.localeCompare(brandB);
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    if (sortMode === 'newest') {
      return new Date(b.last_status_changed_at || b.created_at).getTime() -
             new Date(a.last_status_changed_at || a.created_at).getTime();
    }
    // oldest (FIFO) — default
    return new Date(a.last_status_changed_at || a.created_at).getTime() -
           new Date(b.last_status_changed_at || b.created_at).getTime();
  });

  const copyVideoUrl = async (video: QueueVideo) => {
    const url = video.final_video_url || video.google_drive_url;
    if (!url) {
      showError('No video URL available');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showSuccess('Video URL copied to clipboard');
    } catch {
      showError('Failed to copy URL');
    }
  };

  const handleMarkPosted = async () => {
    if (!postVideoId) return;
    setActionLoading(postVideoId);
    try {
      const body: Record<string, string> = {};
      if (postUrl.trim()) body.posted_url = postUrl.trim();
      body.posted_platform = 'tiktok';

      const res = await fetch(`/api/admin/videos/${postVideoId}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showSuccess('Video marked as posted');
        setVideos(prev => prev.filter(v => v.id !== postVideoId));
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.message || 'Failed to mark as posted');
      }
    } catch {
      showError('Network error');
    } finally {
      setActionLoading(null);
      setPostVideoId(null);
      setPostUrl('');
    }
  };

  const handleSchedule = async () => {
    if (!scheduleVideoId || !scheduleDate) return;
    setActionLoading(scheduleVideoId);
    try {
      const res = await fetch(`/api/videos/${scheduleVideoId}/execution`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploader_notes: `Scheduled for posting: ${scheduleDate}`,
          force: true,
        }),
      });

      if (res.ok) {
        showSuccess(`Scheduled for ${scheduleDate}`);
        // Update the video in the list with the note
        setVideos(prev => prev.map(v =>
          v.id === scheduleVideoId ? { ...v } : v
        ));
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.message || 'Failed to schedule');
      }
    } catch {
      showError('Network error');
    } finally {
      setActionLoading(null);
      setScheduleVideoId(null);
      setScheduleDate('');
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

  return (
    <AdminPageLayout
      title="Posting Queue"
      subtitle="Manual posting bridge — copy video URL, post to TikTok, mark as posted"
      headerActions={
        <button
          onClick={fetchVideos}
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
          label="Ready to Post"
          value={videos.length}
          variant={videos.length > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Posted (recent)"
          value={postedVideos.length}
          variant="success"
        />
        {videos.length > 0 && (
          <StatCard
            label="Oldest Waiting"
            value={getTimeAgo(
              sortedVideos[0]?.last_status_changed_at ?? null,
              sortedVideos[0]?.created_at
            )}
            variant={
              sortedVideos[0] &&
              Date.now() - new Date(sortedVideos[0].last_status_changed_at || sortedVideos[0].created_at).getTime() > 12 * 60 * 60 * 1000
                ? 'danger'
                : 'default'
            }
          />
        )}
      </div>

      {/* Sort controls */}
      {!loading && videos.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3" /> Sort:
          </span>
          {(['oldest', 'newest', 'brand'] as SortMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sortMode === mode
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                  : 'bg-zinc-800 text-zinc-400 border border-white/10 hover:bg-zinc-700'
              }`}
            >
              {mode === 'oldest' ? 'Oldest First (FIFO)' : mode === 'newest' ? 'Newest First' : 'By Brand'}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          <span className="ml-3 text-zinc-500">Loading queue...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && videos.length === 0 && (
        <div className="py-16 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-lg font-medium text-zinc-100 mb-1">Queue is empty</h3>
          <p className="text-sm text-zinc-500">No videos ready to post right now.</p>
        </div>
      )}

      {/* Video cards */}
      {!loading && sortedVideos.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {sortedVideos.map(video => {
            const videoUrl = video.final_video_url || video.google_drive_url;
            const isActioning = actionLoading === video.id;

            return (
              <div
                key={video.id}
                className="bg-zinc-900/50 rounded-xl border border-white/10 overflow-hidden flex flex-col"
              >
                {/* Video thumbnail / player */}
                <div className="aspect-[9/16] max-h-[360px] bg-black relative">
                  {video.final_video_url ? (
                    <video
                      src={video.final_video_url}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 text-sm gap-2">
                      <Play className="w-8 h-8" />
                      <span>No preview available</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-100">
                        {video.product_name || 'Unknown Product'}
                      </h3>
                      <p className="text-sm text-zinc-500">
                        {[video.brand_name, video.product_category].filter(Boolean).join(' / ')}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-600 whitespace-nowrap flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {getTimeAgo(video.last_status_changed_at, video.created_at)}
                    </span>
                  </div>

                  {video.video_code && (
                    <div className="text-[11px] text-zinc-600 font-mono">{video.video_code}</div>
                  )}

                  {/* Composed video URL */}
                  {videoUrl && (
                    <div className="text-xs text-zinc-500 truncate" title={videoUrl}>
                      {videoUrl}
                    </div>
                  )}

                  {/* Script preview */}
                  {video.script_locked_text && (
                    <ScriptPreview text={video.script_locked_text} />
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 mt-auto pt-2">
                    {/* Copy URL */}
                    <button
                      type="button"
                      onClick={() => copyVideoUrl(video)}
                      disabled={!videoUrl}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-zinc-800 text-zinc-100 border border-white/10 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Copy className="w-4 h-4" />
                      Copy Video URL
                    </button>

                    <div className="flex gap-2">
                      {/* Mark as Posted */}
                      <button
                        type="button"
                        onClick={() => {
                          setPostVideoId(video.id);
                          setPostUrl('');
                        }}
                        disabled={isActioning}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isActioning ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        Mark Posted
                      </button>

                      {/* Schedule */}
                      <button
                        type="button"
                        onClick={() => {
                          setScheduleVideoId(video.id);
                          setScheduleDate('');
                        }}
                        disabled={isActioning}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Calendar className="w-4 h-4" />
                        Schedule
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recently Posted */}
      {!loading && postedVideos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-zinc-300">
            Recently Posted
            <span className="ml-2 text-sm font-normal text-zinc-500">
              {postedVideos.length} video{postedVideos.length !== 1 ? 's' : ''}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {postedVideos.map(video => (
              <div
                key={video.id}
                className="bg-zinc-900/50 border border-emerald-500/20 rounded-xl p-4 space-y-2"
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
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                    POSTED
                  </span>
                </div>
                {video.video_code && (
                  <div className="text-[11px] text-zinc-600 font-mono">{video.video_code}</div>
                )}
                <div className="text-xs text-zinc-500">
                  {getTimeAgo(video.last_status_changed_at, video.created_at)}
                </div>
                {video.posted_url && (
                  <a
                    href={video.posted_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View on platform
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mark as Posted modal */}
      {postVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setPostVideoId(null)} />
          <div
            className="relative bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Mark as Posted</h3>
            <p className="text-sm text-zinc-500">
              Optionally paste the TikTok URL where this video was posted.
            </p>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                TikTok URL <span className="text-zinc-600">(optional)</span>
              </label>
              <input
                type="url"
                value={postUrl}
                onChange={e => setPostUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@account/video/..."
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-white/10 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPostVideoId(null);
                  setPostUrl('');
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-zinc-800 text-zinc-300 border border-white/10 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMarkPosted}
                disabled={actionLoading !== null}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Confirm Posted
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule modal */}
      {scheduleVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setScheduleVideoId(null)} />
          <div
            className="relative bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Schedule Posting</h3>
            <p className="text-sm text-zinc-500">
              Set a target posting date for this video.
            </p>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Posting Date
              </label>
              <input
                type="date"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 [color-scheme:dark]"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setScheduleVideoId(null);
                  setScheduleDate('');
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-zinc-800 text-zinc-300 border border-white/10 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSchedule}
                disabled={!scheduleDate || actionLoading !== null}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Calendar className="w-4 h-4" />
                )}
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}

/** Collapsible script preview */
function ScriptPreview({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="group" open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400 select-none flex items-center gap-1">
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Script preview
      </summary>
      <pre className="mt-2 text-xs text-zinc-400 whitespace-pre-wrap bg-zinc-800/50 rounded-lg p-3 max-h-32 overflow-y-auto font-mono">
        {text}
      </pre>
    </details>
  );
}
