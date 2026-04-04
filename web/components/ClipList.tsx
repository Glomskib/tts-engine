'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, X, Film, Loader2, Trash2, ChevronUp, ChevronDown,
  GripVertical, Scissors, Clock,
} from 'lucide-react';
import type { ContentItemAsset } from '@/lib/content-items/types';

interface ClipListProps {
  contentItemId: string;
  clips: ContentItemAsset[];
  onClipsChange: (clips: ContentItemAsset[]) => void;
  /** Total duration of all clips after trims */
  onTotalDurationChange?: (totalSec: number) => void;
}

const MAX_SIZE_MB = 500;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
const ALLOWED_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi'];

export default function ClipList({
  contentItemId,
  clips,
  onClipsChange,
  onTotalDurationChange,
}: ClipListProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Compute total effective duration whenever clips change
  useEffect(() => {
    if (!onTotalDurationChange) return;
    let total = 0;
    for (const clip of clips) {
      const dur = clip.duration_sec ?? 0;
      const trimStart = clip.trim_start_sec ?? 0;
      const trimEnd = clip.trim_end_sec ?? dur;
      total += Math.max(0, (dur > 0 ? Math.min(trimEnd, dur) : trimEnd) - trimStart);
    }
    onTotalDurationChange(total > 0 ? total : 0);
  }, [clips, onTotalDurationChange]);

  const uploadClip = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Invalid format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`File too large (${Math.round(file.size / 1024 / 1024)} MB). Max ${MAX_SIZE_MB} MB.`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener('load', () => {
      setUploading(false);
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && json.ok) {
          onClipsChange([...clips, json.data]);
        } else {
          setError(json.error || `Upload failed (${xhr.status})`);
        }
      } catch {
        setError('Invalid response from server');
      }
    });

    xhr.addEventListener('error', () => { setUploading(false); setError('Network error'); });
    xhr.addEventListener('abort', () => { setUploading(false); });

    xhr.open('POST', `/api/content-items/${contentItemId}/clips`);
    xhr.send(formData);
  }, [contentItemId, clips, onClipsChange]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.[0]) uploadClip(files[0]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) uploadClip(file);
  };

  const handleRemoveClip = async (clipId: string) => {
    const res = await fetch(`/api/content-items/${contentItemId}/clips/${clipId}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.ok) {
      const updated = clips.filter(c => c.id !== clipId);
      // Reindex locally
      updated.forEach((c, i) => { c.sequence_index = i; });
      onClipsChange(updated);
    }
  };

  const handleMoveClip = async (clipId: string, direction: 'up' | 'down') => {
    const idx = clips.findIndex(c => c.id === clipId);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= clips.length) return;

    const reordered = [...clips];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    reordered.forEach((c, i) => { c.sequence_index = i; });
    onClipsChange(reordered);

    // Persist both changed indices
    await Promise.all([
      fetch(`/api/content-items/${contentItemId}/clips/${reordered[idx].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence_index: idx }),
      }),
      fetch(`/api/content-items/${contentItemId}/clips/${reordered[newIdx].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence_index: newIdx }),
      }),
    ]);
  };

  const handleDurationDetected = async (clipId: string, duration: number) => {
    const updated = clips.map(c =>
      c.id === clipId ? { ...c, duration_sec: duration } : c
    );
    onClipsChange(updated);
    await fetch(`/api/content-items/${contentItemId}/clips/${clipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_sec: duration }),
    }).catch(() => { /* best-effort */ });
  };

  const handleTrimChange = async (clipId: string, field: 'trim_start_sec' | 'trim_end_sec', value: number | null) => {
    const updated = clips.map(c =>
      c.id === clipId ? { ...c, [field]: value } : c
    );
    onClipsChange(updated);
    await fetch(`/api/content-items/${contentItemId}/clips/${clipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    }).catch(() => { /* best-effort */ });
  };

  const fmtDur = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2">
      {/* Clip list */}
      {clips.map((clip, i) => (
        <ClipRow
          key={clip.id}
          clip={clip}
          index={i}
          total={clips.length}
          onRemove={() => handleRemoveClip(clip.id)}
          onMove={(dir) => handleMoveClip(clip.id, dir)}
          onDurationDetected={(dur) => handleDurationDetected(clip.id, dur)}
          onTrimChange={(field, val) => handleTrimChange(clip.id, field, val)}
          fmtDur={fmtDur}
        />
      ))}

      {/* Upload progress */}
      {uploading && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="text-blue-400 animate-spin" />
            <span className="text-xs text-blue-300">Uploading clip... {uploadProgress}%</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1 mt-1.5">
            <div className="bg-blue-500 h-1 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 flex items-center gap-2">
          <X size={12} className="text-red-400" />
          <span className="text-xs text-red-300">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300">Dismiss</button>
        </div>
      )}

      {/* Add clip drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500 bg-zinc-900/50 hover:bg-zinc-900 p-3 cursor-pointer transition text-center"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.mov,.webm,.avi,video/mp4,video/quicktime,video/webm,video/x-msvideo"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="flex items-center justify-center gap-2">
          <Upload size={14} className="text-zinc-500" />
          <span className="text-xs text-zinc-400">
            {clips.length === 0 ? 'Add first clip' : 'Add another clip'}
          </span>
        </div>
        <p className="text-[10px] text-zinc-600 mt-0.5">MP4, MOV, WebM, AVI &middot; Max {MAX_SIZE_MB} MB</p>
      </div>

      {/* Testing guidance for empty state */}
      {clips.length === 0 && (
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Use clips to stitch multiple videos into one. Start with 2&ndash;3 short clips (under 60s each) for your first test.
        </p>
      )}
    </div>
  );
}

// ── Individual Clip Row ─────────────────────────────────────────

interface ClipRowProps {
  clip: ContentItemAsset;
  index: number;
  total: number;
  onRemove: () => void;
  onMove: (dir: 'up' | 'down') => void;
  onDurationDetected: (dur: number) => void;
  onTrimChange: (field: 'trim_start_sec' | 'trim_end_sec', value: number | null) => void;
  fmtDur: (sec: number) => string;
}

function ClipRow({ clip, index, total, onRemove, onMove, onDurationDetected, onTrimChange, fmtDur }: ClipRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState(false);

  const dur = clip.duration_sec ?? 0;
  const trimStart = clip.trim_start_sec ?? 0;
  const trimEnd = clip.trim_end_sec ?? dur;
  const effectiveDur = dur > 0 ? Math.max(0, Math.min(trimEnd, dur) - trimStart) : 0;
  const hasTrim = (clip.trim_start_sec != null && clip.trim_start_sec > 0) ||
                  (clip.trim_end_sec != null && dur > 0 && clip.trim_end_sec < dur);

  return (
    <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/50 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <GripVertical size={12} className="text-zinc-600 flex-shrink-0" />
        <span className="text-[10px] font-mono text-zinc-500 w-4 text-center">{index + 1}</span>
        <Film size={12} className="text-zinc-500 flex-shrink-0" />
        <span className="text-xs text-zinc-300 truncate flex-1">{clip.file_name || `Clip ${index + 1}`}</span>

        {dur > 0 && (
          <span className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Clock size={9} />
            {hasTrim ? fmtDur(effectiveDur) + ' / ' + fmtDur(dur) : fmtDur(dur)}
          </span>
        )}

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onMove('up')}
            disabled={index === 0}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition"
            title="Move up"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => onMove('down')}
            disabled={index === total - 1}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition"
            title="Move down"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 transition"
            title="Trim settings"
          >
            <Scissors size={14} className={hasTrim ? 'text-cyan-400' : ''} />
          </button>
          <button
            onClick={async () => { setRemoving(true); await onRemove(); }}
            disabled={removing}
            className="p-1.5 text-zinc-500 hover:text-red-400 disabled:opacity-50 transition"
            title="Remove clip"
          >
            {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded: preview + trim controls */}
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-zinc-800">
          {clip.file_url && (
            <video
              src={clip.file_url}
              controls
              preload="metadata"
              className="w-full rounded max-h-32 bg-black mt-2"
              onLoadedMetadata={(e) => {
                const d = (e.target as HTMLVideoElement).duration;
                if (d && isFinite(d)) onDurationDetected(Math.round(d * 100) / 100);
              }}
            />
          )}
          <div className="flex items-center gap-3">
            <label className="text-[10px] text-zinc-500 flex items-center gap-1">
              Trim start
              <input
                type="number"
                min={0}
                max={dur > 0 ? dur : undefined}
                step={0.1}
                value={clip.trim_start_sec ?? ''}
                onChange={(e) => {
                  const v = e.target.value ? parseFloat(e.target.value) : null;
                  onTrimChange('trim_start_sec', v);
                }}
                placeholder="0"
                className="w-16 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 px-1.5 py-0.5 focus:outline-none focus:border-cyan-500"
              />
              <span className="text-zinc-600">s</span>
            </label>
            <label className="text-[10px] text-zinc-500 flex items-center gap-1">
              Trim end
              <input
                type="number"
                min={0}
                max={dur > 0 ? dur : undefined}
                step={0.1}
                value={clip.trim_end_sec ?? ''}
                onChange={(e) => {
                  const v = e.target.value ? parseFloat(e.target.value) : null;
                  onTrimChange('trim_end_sec', v);
                }}
                placeholder={dur > 0 ? String(dur) : ''}
                className="w-16 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 px-1.5 py-0.5 focus:outline-none focus:border-cyan-500"
              />
              <span className="text-zinc-600">s</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
