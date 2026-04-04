'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2, AlertTriangle, Upload } from 'lucide-react';
import { RecordingScriptCard } from './RecordingScriptCard';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { ShortcutBadge } from '@/hooks/useKeyboardShortcuts';

// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal video shape required from the pipeline's QueueVideo */
export interface SessionVideo {
  id: string;
  video_code: string | null;
  recording_status: string | null;
  script_locked_text: string | null;
  brand_name?: string;
  product_name?: string;
  blocked_reason: string | null;
  can_record: boolean;
  concept_id: string | null;
}

interface VideoDetails {
  brief: {
    title?: string | null;
    hook_options?: string[] | null;
    visual_hook?: string | null;
    on_screen_text_hook?: string | null;
    on_screen_text_mid?: string | null;
    on_screen_text_cta?: string | null;
    notes?: string | null;
    tone_preset?: string | null;
  } | null;
}

interface RecordingSessionViewProps {
  videos: SessionVideo[];
  onClose: () => void;
  onMarkRecorded: (videoId: string) => Promise<void>;
  onRefresh: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getDisplayTitle(v: SessionVideo): string {
  if (v.brand_name && v.product_name) {
    let seq = '';
    if (v.video_code) {
      const m = v.video_code.match(/-(\d{3})$/);
      if (m) seq = ` #${parseInt(m[1], 10)}`;
    }
    return `${v.brand_name} — ${v.product_name}${seq}`;
  }
  return v.video_code || v.id.slice(0, 8);
}

function parseScriptSections(scriptText: string) {
  const sections: { label: string; content: string; type: 'hook' | 'beat' | 'cta' | 'overlay' | 'note' }[] = [];
  const lines = scriptText.split('\n');
  let currentLabel = '';
  let currentContent: string[] = [];
  let currentType: 'hook' | 'beat' | 'cta' | 'overlay' | 'note' = 'beat';

  const flush = () => {
    if (currentLabel && currentContent.length > 0) {
      sections.push({ label: currentLabel, content: currentContent.join('\n').trim(), type: currentType });
    }
    currentContent = [];
  };

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/);
    const boldMatch = line.match(/^\*\*(.+?)\*\*\s*$/);
    const bracketMatch = line.match(/^\[(.+?)\]\s*$/);

    if (headerMatch || boldMatch || bracketMatch) {
      flush();
      const text = (headerMatch?.[1] || boldMatch?.[1] || bracketMatch?.[1])!.trim();
      currentLabel = text;
      const lower = text.toLowerCase();
      if (lower.includes('hook')) currentType = 'hook';
      else if (lower.includes('cta') || lower.includes('call to action')) currentType = 'cta';
      else if (lower.includes('overlay') || lower.includes('on-screen') || lower.includes('text')) currentType = 'overlay';
      else if (lower.includes('note') || lower.includes('direction')) currentType = 'note';
      else currentType = 'beat';
    } else {
      currentContent.push(line);
    }
  }
  flush();

  return sections;
}

// ── Component ──────────────────────────────────────────────────────────────

export function RecordingSessionView({
  videos,
  onClose,
  onMarkRecorded,
  onRefresh,
}: RecordingSessionViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [largeMode, setLargeMode] = useState(false);
  const [teleprompterMode, setTeleprompterMode] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [detailsCache, setDetailsCache] = useState<Record<string, VideoDetails>>({});

  const total = videos.length;
  const video = videos[currentIndex];

  // Prefetch details for current + next video
  const fetchDetails = useCallback(async (videoId: string) => {
    if (detailsCache[videoId]) return;
    try {
      const res = await fetch(`/api/videos/${videoId}/details`);
      const json = await res.json();
      if (json.ok) {
        setDetailsCache(prev => ({ ...prev, [videoId]: { brief: json.brief } }));
      }
    } catch {
      // Non-fatal
    }
  }, [detailsCache]);

  useEffect(() => {
    if (video) fetchDetails(video.id);
    // Prefetch next
    if (currentIndex < total - 1) {
      fetchDetails(videos[currentIndex + 1].id);
    }
  }, [currentIndex, video, total, videos, fetchDetails]);

  // Navigation
  const goNext = useCallback(() => {
    if (currentIndex < total - 1) setCurrentIndex(i => i + 1);
  }, [currentIndex, total]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  // Actions
  const handleMarkRecorded = useCallback(async () => {
    if (!video || actionLoading) return;
    setActionLoading(true);
    try {
      await onMarkRecorded(video.id);
      setCompletedIds(prev => new Set(prev).add(video.id));
      // Auto-advance
      if (currentIndex < total - 1) {
        setCurrentIndex(i => i + 1);
      }
    } finally {
      setActionLoading(false);
    }
  }, [video, actionLoading, onMarkRecorded, currentIndex, total]);

  const handleSkip = useCallback(() => {
    if (!video) return;
    setSkippedIds(prev => new Set(prev).add(video.id));
    if (currentIndex < total - 1) {
      setCurrentIndex(i => i + 1);
    }
  }, [video, currentIndex, total]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: 'j', handler: goNext, description: 'Next video' },
    { key: 'k', handler: goPrev, description: 'Previous video' },
    { key: 'r', handler: handleMarkRecorded, description: 'Mark recorded' },
    { key: 'Escape', handler: onClose, description: 'Exit session' },
  ]);

  // Build sections from details + script
  const sections = useMemo(() => {
    if (!video) return [];
    const details = detailsCache[video.id];
    const result: { label: string; content: string; type: 'hook' | 'beat' | 'cta' | 'overlay' | 'note' }[] = [];

    // Hook from brief
    const brief = details?.brief;
    const hookLine = brief?.visual_hook
      || (brief?.hook_options && brief.hook_options.length > 0 ? brief.hook_options[0] : null);

    if (hookLine) {
      result.push({ label: 'Hook', content: hookLine, type: 'hook' });
    }

    // Parse script for structure
    if (video.script_locked_text) {
      const parsed = parseScriptSections(video.script_locked_text);
      if (parsed.length > 0) {
        result.push(...parsed);
      }
    }

    // CTA from brief
    if (brief?.on_screen_text_cta) {
      result.push({ label: 'CTA', content: brief.on_screen_text_cta, type: 'cta' });
    }

    // Overlays
    const overlays: string[] = [];
    if (brief?.on_screen_text_hook) overlays.push(`Hook: ${brief.on_screen_text_hook}`);
    if (brief?.on_screen_text_mid) overlays.push(`Mid: ${brief.on_screen_text_mid}`);
    if (overlays.length > 0) {
      result.push({ label: 'Overlay Notes', content: overlays.join('\n'), type: 'overlay' });
    }

    // Filming notes
    if (brief?.notes) {
      result.push({ label: 'Notes', content: brief.notes, type: 'note' });
    }
    if (brief?.tone_preset) {
      result.push({ label: 'Tone', content: brief.tone_preset, type: 'note' });
    }

    return result;
  }, [video, detailsCache]);

  // Progress stats
  const doneCount = completedIds.size;
  const skipCount = skippedIds.size;

  if (!video) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl mb-3">No videos to record</div>
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
            <span className="text-sm font-medium text-white">Recording Session</span>
            <span className="text-xs text-zinc-500 ml-2 hidden sm:inline">
              {doneCount} recorded, {skipCount} skipped
            </span>
          </div>
        </div>

        {/* Navigation + position */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 tabular-nums mr-1">
            {currentIndex + 1} of {total}
          </span>
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous (K)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goNext}
            disabled={currentIndex === total - 1}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next (J)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* View toggles */}
        <div className="hidden sm:flex items-center gap-1.5">
          <button
            onClick={() => setTeleprompterMode(!teleprompterMode)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              teleprompterMode
                ? 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/40'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            Teleprompter
          </button>
          <button
            onClick={() => setLargeMode(!largeMode)}
            className={`p-1.5 rounded-lg transition-colors ${
              largeMode
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
            title={largeMode ? 'Standard text' : 'Large text'}
          >
            {largeMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-zinc-900 shrink-0">
        <div
          className="h-full bg-teal-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
        />
      </div>

      {/* Main content — scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className={`max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 ${teleprompterMode ? 'flex items-center min-h-full' : ''}`}>
          {/* Blocked warning */}
          {video.blocked_reason && (
            <div className="flex items-center gap-2 px-4 py-2.5 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-sm text-red-400">{video.blocked_reason}</span>
            </div>
          )}

          {/* Status pill for completed/skipped */}
          {videoStatus !== 'pending' && (
            <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium mb-4 ${
              videoStatus === 'completed'
                ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/30'
                : 'bg-zinc-700/50 text-zinc-400 ring-1 ring-zinc-600'
            }`}>
              {videoStatus === 'completed' ? 'Recorded' : 'Skipped'}
            </div>
          )}

          <RecordingScriptCard
            title={getDisplayTitle(video)}
            brand={video.brand_name}
            scriptText={video.script_locked_text}
            sections={sections}
            largeMode={largeMode}
            teleprompterMode={teleprompterMode}
          />
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          {/* Left: skip / blocked */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSkip}
              className="px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-600 transition-colors"
            >
              Skip
            </button>
          </div>

          {/* Center: progress dots (desktop only) */}
          <div className="hidden sm:flex items-center gap-1 max-w-[300px] overflow-hidden">
            {videos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => setCurrentIndex(i)}
                className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                  i === currentIndex
                    ? 'bg-teal-400 scale-125'
                    : completedIds.has(v.id)
                    ? 'bg-green-500/60'
                    : skippedIds.has(v.id)
                    ? 'bg-zinc-600'
                    : 'bg-zinc-700 hover:bg-zinc-500'
                }`}
                title={`Video ${i + 1}`}
              />
            ))}
          </div>

          {/* Right: primary action */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkRecorded}
              disabled={actionLoading || !video.can_record}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {actionLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : null}
              Mark Recorded
              <ShortcutBadge shortcutKey="R" className="hidden sm:inline-flex ml-1 opacity-60" />
            </button>
          </div>
        </div>

        {/* Mobile keyboard shortcut hint */}
        <div className="sm:hidden mt-2 text-center">
          <span className="text-[10px] text-zinc-600">Swipe or tap arrows to navigate</span>
        </div>
      </div>
    </div>
  );
}
