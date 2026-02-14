"use client";

import { useState, useEffect, useCallback } from "react";

/* ---------- Types ---------- */

interface VAVideo {
  id: string;
  video_code: string;
  status: string;
  recording_status: string;
  product_name: string | null;
  product_brand: string | null;
  script_locked_text: string | null;
  google_drive_url: string | null;
  final_video_url: string | null;
  posted_url: string | null;
  recording_notes: string | null;
  editor_notes: string | null;
  uploader_notes: string | null;
  edit_notes: string | null;
  assigned_to: string;
  assigned_role: string | null;
  assignment_state: string | null;
  last_status_changed_at: string | null;
  created_at: string;
}

/* ---------- Constants ---------- */

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  NEEDS_SCRIPT: { label: "Needs Script", color: "text-zinc-400", bg: "bg-zinc-700" },
  GENERATING_SCRIPT: { label: "Writing Script...", color: "text-blue-400", bg: "bg-blue-900/50" },
  NOT_RECORDED: { label: "Ready to Record", color: "text-yellow-400", bg: "bg-yellow-900/40" },
  AI_RENDERING: { label: "AI Rendering...", color: "text-purple-400", bg: "bg-purple-900/40" },
  RECORDED: { label: "Recorded — Edit Now", color: "text-amber-400", bg: "bg-amber-900/40" },
  EDITED: { label: "Edited — Review", color: "text-blue-400", bg: "bg-blue-900/40" },
  READY_FOR_REVIEW: { label: "In Review", color: "text-indigo-400", bg: "bg-indigo-900/40" },
  APPROVED_NEEDS_EDITS: { label: "Approved — Needs Edits", color: "text-amber-400", bg: "bg-amber-900/40" },
  READY_TO_POST: { label: "Ready to Post", color: "text-green-400", bg: "bg-green-900/40" },
  POSTED: { label: "Posted", color: "text-emerald-400", bg: "bg-emerald-900/40" },
  REJECTED: { label: "Rejected", color: "text-red-400", bg: "bg-red-900/40" },
};

const ACTION_BUTTONS: Record<string, { label: string; nextStatus: string; color: string }> = {
  NOT_RECORDED: { label: "Start Recording", nextStatus: "RECORDED", color: "bg-yellow-600 hover:bg-yellow-500" },
  RECORDED: { label: "Start Editing", nextStatus: "EDITED", color: "bg-blue-600 hover:bg-blue-500" },
  EDITED: { label: "Submit for Review", nextStatus: "READY_TO_POST", color: "bg-teal-600 hover:bg-teal-500" },
  APPROVED_NEEDS_EDITS: { label: "Submit Edits", nextStatus: "READY_TO_POST", color: "bg-amber-600 hover:bg-amber-500" },
  READY_TO_POST: { label: "Mark as Posted", nextStatus: "POSTED", color: "bg-green-600 hover:bg-green-500" },
};

/* ---------- Helpers ---------- */

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function elapsedTimer(dateStr: string | null): { text: string; color: string; isOverdue: boolean } {
  if (!dateStr) return { text: "", color: "text-zinc-500", isOverdue: false };
  const hours = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
  if (hours < 4) return { text: `${hours.toFixed(1)}h`, color: "text-green-400", isOverdue: false };
  if (hours < 12) return { text: `${hours.toFixed(1)}h`, color: "text-amber-400", isOverdue: false };
  if (hours < 24) return { text: `${hours.toFixed(1)}h`, color: "text-orange-400", isOverdue: false };
  return { text: `${hours.toFixed(0)}h`, color: "text-red-400", isOverdue: true };
}

/* ---------- Components ---------- */

function NameEntry({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");

  // Check localStorage for saved name
  useEffect(() => {
    const saved = localStorage.getItem("va_name");
    if (saved) onSubmit(saved);
  }, [onSubmit]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Welcome</h1>
        <p className="text-zinc-400 text-lg">Enter your name to see your assignments</p>
      </div>
      <div className="w-full max-w-sm space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              localStorage.setItem("va_name", name.trim());
              onSubmit(name.trim());
            }
          }}
          placeholder="Your name..."
          className="w-full px-5 py-4 text-xl bg-zinc-900 border border-zinc-700 rounded-xl
                     text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500
                     focus:ring-2 focus:ring-teal-500/20"
          autoFocus
        />
        <button
          onClick={() => {
            if (name.trim()) {
              localStorage.setItem("va_name", name.trim());
              onSubmit(name.trim());
            }
          }}
          disabled={!name.trim()}
          className="w-full py-4 text-xl font-semibold rounded-xl bg-teal-600 hover:bg-teal-500
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          View My Work
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, color: "text-zinc-400", bg: "bg-zinc-700" };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color} ${config.bg}`}>
      {config.label}
    </span>
  );
}

function VideoCard({
  video,
  vaName,
  onStatusChange,
}: {
  video: VAVideo;
  vaName: string;
  onStatusChange: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [postedUrl, setPostedUrl] = useState("");
  const [notes, setNotes] = useState("");

  const action = ACTION_BUTTONS[video.recording_status];

  async function handleAction() {
    if (!action) return;

    // Validate required fields
    if (action.nextStatus === "READY_TO_POST" && !videoUrl && !video.final_video_url && !video.google_drive_url) {
      setError("Please enter the video URL first");
      return;
    }
    if (action.nextStatus === "POSTED" && !postedUrl) {
      setError("Please enter the TikTok link first");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: Record<string, string> = {
        recording_status: action.nextStatus,
        va_name: vaName,
      };
      if (notes) payload.notes = notes;
      if (videoUrl) payload.video_url = videoUrl;
      if (postedUrl) payload.posted_url = postedUrl;
      if (action.nextStatus === "POSTED") payload.posted_platform = "tiktok";

      const vaToken = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') || '' : '';
      const res = await fetch(`/api/va/videos/${video.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-va-token": vaToken },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setNotes("");
        setVideoUrl("");
        setPostedUrl("");
        onStatusChange();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-900/50">
      {/* Card Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <StatusBadge status={video.recording_status} />
            <span className="text-xs text-zinc-500">{timeAgo(video.last_status_changed_at)}</span>
            {/* SLA Timer */}
            {video.last_status_changed_at && (() => {
              const timer = elapsedTimer(video.last_status_changed_at);
              return (
                <span className={`text-xs font-mono ${timer.color} ${timer.isOverdue ? 'animate-pulse' : ''}`}>
                  {timer.isOverdue ? '⚠ ' : '⏱ '}{timer.text}
                </span>
              );
            })()}
          </div>
          <div className="font-medium text-lg truncate">
            {video.product_name || video.video_code || "Untitled Video"}
          </div>
          {video.product_brand && (
            <div className="text-sm text-zinc-500">{video.product_brand}</div>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-zinc-800 space-y-4">
          {/* Script */}
          {video.script_locked_text && (
            <div className="mt-4">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                Script
              </div>
              <div className="bg-zinc-800/60 rounded-xl p-4 text-sm text-zinc-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                {video.script_locked_text}
              </div>
            </div>
          )}

          {/* Notes from admin */}
          {(video.recording_notes || video.editor_notes || video.uploader_notes) && (
            <div>
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                Notes from Admin
              </div>
              <div className="bg-zinc-800/60 rounded-xl p-4 text-sm text-zinc-300">
                {video.recording_notes || video.editor_notes || video.uploader_notes}
              </div>
            </div>
          )}

          {/* Existing links */}
          {(video.final_video_url || video.google_drive_url) && (
            <div>
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                Video Link
              </div>
              <a
                href={video.final_video_url || video.google_drive_url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 underline text-sm break-all"
              >
                {video.final_video_url || video.google_drive_url}
              </a>
            </div>
          )}

          {/* Input fields based on next action */}
          {action && (
            <div className="space-y-3 pt-2">
              {/* Video URL input — shown when moving to READY_TO_POST or EDITED */}
              {(action.nextStatus === "EDITED" || action.nextStatus === "READY_TO_POST") &&
                !video.final_video_url && !video.google_drive_url && (
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">
                    Video Link (Google Drive, Dropbox, etc.)
                  </label>
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl
                               text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
                  />
                </div>
              )}

              {/* Posted URL — shown when marking as POSTED */}
              {action.nextStatus === "POSTED" && (
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">
                    TikTok Link (paste after posting)
                  </label>
                  <input
                    type="url"
                    value={postedUrl}
                    onChange={(e) => setPostedUrl(e.target.value)}
                    placeholder="https://www.tiktok.com/@..."
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl
                               text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
                  />
                </div>
              )}

              {/* Notes — always available */}
              <div>
                <label className="text-sm text-zinc-400 block mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any notes about this video..."
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl
                             text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>

              {error && (
                <div className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <button
                onClick={handleAction}
                disabled={loading}
                className={`w-full py-4 text-lg font-bold rounded-xl text-white transition-colors
                            ${action.color} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? "Updating..." : action.label}
              </button>
            </div>
          )}

          {/* Trending sound tip for ready-to-post videos */}
          {video.recording_status === "READY_TO_POST" && (
            <div className="p-4 bg-blue-900/20 border border-blue-800/40 rounded-xl text-sm text-blue-300">
              <span className="font-semibold">TikTok tip:</span> After uploading, add a trending original sound in the TikTok app if the video is eligible. Shop-tagged videos can use original sounds but NOT commercial music.
            </div>
          )}

          {/* Edit notes for approved-needs-edits videos */}
          {video.recording_status === "APPROVED_NEEDS_EDITS" && video.edit_notes && (
            <div className="mt-2 p-4 bg-amber-900/20 border border-amber-900/40 rounded-xl">
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">
                Edits Requested
              </div>
              <div className="text-sm text-amber-300">
                {video.edit_notes}
              </div>
            </div>
          )}

          {/* Revision notes for rejected videos */}
          {video.recording_status === "REJECTED" && (
            <div className="mt-2 p-4 bg-red-900/20 border border-red-900/40 rounded-xl">
              <div className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">
                Revision Needed
              </div>
              <div className="text-sm text-red-300">
                {video.editor_notes || video.recording_notes || "Please check with your admin for revision details."}
              </div>
              <button
                onClick={() => {
                  // Allow re-editing rejected videos
                  handleAction();
                }}
                disabled={loading}
                className="mt-3 w-full py-3 text-sm font-bold rounded-xl text-white bg-amber-600 hover:bg-amber-500 transition-colors disabled:opacity-50"
              >
                {loading ? "Updating..." : "Start Revision"}
              </button>
            </div>
          )}

          {/* Terminal states — no action */}
          {!action && video.recording_status !== "REJECTED" && (
            <div className="text-center py-4 text-zinc-500 text-sm">
              {video.recording_status === "POSTED"
                ? "This video has been posted. Nice work! 🎉"
                : "No action available for this status."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function VADashboard() {
  const [vaName, setVaName] = useState<string | null>(null);
  const [videos, setVideos] = useState<VAVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const fetchVideos = useCallback(async () => {
    if (!vaName) return;
    setLoading(true);
    try {
      const vaToken = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') || '' : '';
      const res = await fetch(`/api/va/videos?va_name=${encodeURIComponent(vaName)}&token=${encodeURIComponent(vaToken)}`);
      const data = await res.json();
      if (data.ok) {
        setVideos(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch videos:", err);
    } finally {
      setLoading(false);
    }
  }, [vaName]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!vaName) return;
    const interval = setInterval(fetchVideos, 30000);
    return () => clearInterval(interval);
  }, [vaName, fetchVideos]);

  if (!vaName) {
    return <NameEntry onSubmit={setVaName} />;
  }

  // Filter videos
  const filtered = filter === "all"
    ? videos
    : videos.filter((v) => v.recording_status === filter);

  // Count by status
  const counts: Record<string, number> = {};
  videos.forEach((v) => {
    counts[v.recording_status] = (counts[v.recording_status] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">Hi, {vaName}</h1>
            <p className="text-zinc-400 text-sm">
              {videos.length === 0 ? "No assignments right now" : `${videos.length} video${videos.length !== 1 ? "s" : ""} assigned to you`}
            </p>
          </div>
          {/* New assignments badge */}
          {(() => {
            const newCount = videos.filter(v => {
              const changed = v.last_status_changed_at;
              if (!changed) return false;
              const hoursSinceChange = (Date.now() - new Date(changed).getTime()) / (1000 * 60 * 60);
              return hoursSinceChange < 4 && ['NOT_RECORDED', 'RECORDED'].includes(v.recording_status);
            }).length;
            return newCount > 0 ? (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-teal-600/20 border border-teal-500/30 text-teal-400 text-xs font-bold rounded-full animate-pulse">
                {newCount} new
              </span>
            ) : null;
          })()}
          {/* Overdue badge */}
          {(() => {
            const overdueCount = videos.filter(v => {
              if (!v.last_status_changed_at) return false;
              const hours = (Date.now() - new Date(v.last_status_changed_at).getTime()) / (1000 * 60 * 60);
              return hours > 24 && !['POSTED', 'READY_TO_POST'].includes(v.recording_status);
            }).length;
            return overdueCount > 0 ? (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-bold rounded-full">
                {overdueCount} overdue
              </span>
            ) : null;
          })()}
        </div>
        <button
          onClick={() => {
            localStorage.removeItem("va_name");
            setVaName(null);
            setVideos([]);
          }}
          className="text-sm text-zinc-500 hover:text-zinc-300 px-3 py-2 rounded-lg
                     hover:bg-zinc-800 transition-colors"
        >
          Switch User
        </button>
      </div>

      {/* Quick Stats */}
      {videos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "To Record", key: "NOT_RECORDED", color: "border-yellow-500/30 bg-yellow-900/10" },
            { label: "To Edit", key: "RECORDED", color: "border-amber-500/30 bg-amber-900/10" },
            { label: "In Review", key: "EDITED", color: "border-blue-500/30 bg-blue-900/10" },
            { label: "Ready to Post", key: "READY_TO_POST", color: "border-green-500/30 bg-green-900/10" },
          ].map(({ label, key, color }) => (
            <button
              key={key}
              onClick={() => setFilter(filter === key ? "all" : key)}
              className={`border rounded-xl p-3 text-center transition-all ${color}
                ${filter === key ? "ring-2 ring-teal-500" : "hover:ring-1 hover:ring-zinc-600"}`}
            >
              <div className="text-2xl font-bold">{counts[key] || 0}</div>
              <div className="text-xs text-zinc-400">{label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Filter bar */}
      {videos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors
              ${filter === "all" ? "bg-teal-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
          >
            All ({videos.length})
          </button>
          {Object.entries(counts).map(([status, count]) => (
            <button
              key={status}
              onClick={() => setFilter(filter === status ? "all" : status)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors
                ${filter === status ? "bg-teal-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
            >
              {STATUS_CONFIG[status]?.label || status} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && videos.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full" />
        </div>
      )}

      {/* Empty state */}
      {!loading && videos.length === 0 && (
        <div className="text-center py-20 space-y-4">
          <div className="text-5xl">🎬</div>
          <div className="text-xl font-semibold text-zinc-300">No videos assigned</div>
          <p className="text-zinc-500 max-w-xs mx-auto">
            When your admin assigns you videos, they will appear here.
          </p>
          <button
            onClick={fetchVideos}
            className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm transition-colors"
          >
            Refresh
          </button>
        </div>
      )}

      {/* Video List */}
      <div className="space-y-3">
        {filtered.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            vaName={vaName}
            onStatusChange={fetchVideos}
          />
        ))}
      </div>

      {/* Filtered empty */}
      {filtered.length === 0 && videos.length > 0 && (
        <div className="text-center py-10 text-zinc-500">
          No videos with this status.
          <button
            onClick={() => setFilter("all")}
            className="text-teal-400 ml-1 underline"
          >
            Show all
          </button>
        </div>
      )}

      {/* Refresh indicator */}
      <div className="text-center text-xs text-zinc-600 pb-4">
        Auto-refreshes every 30 seconds
      </div>
    </div>
  );
}
