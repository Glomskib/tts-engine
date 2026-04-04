'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Film, Loader2, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';

interface RawVideoUploadProps {
  contentItemId: string;
  currentUrl?: string | null;
  onUploadComplete?: (url: string, storagePath: string) => void;
  onRemove?: () => void;
  onDurationDetected?: (durationSec: number) => void;
}

const MAX_SIZE_MB = 500;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
const ALLOWED_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi'];

type UploadState = 'idle' | 'validating' | 'uploading' | 'success' | 'error';

export default function RawVideoUpload({
  contentItemId,
  currentUrl,
  onUploadComplete,
  onRemove,
  onDurationDetected,
}: RawVideoUploadProps) {
  const [state, setState] = useState<UploadState>(currentUrl ? 'success' : 'idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const validate = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validType = ALLOWED_TYPES.includes(file.type);
    const validExt = ALLOWED_EXTENSIONS.includes(ext);

    if (!validType && !validExt) {
      return `Invalid format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File too large (${Math.round(file.size / 1024 / 1024)} MB). Max ${MAX_SIZE_MB} MB.`;
    }
    return null;
  };

  const upload = useCallback((file: File) => {
    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      setState('error');
      return;
    }

    setFileName(file.name);
    setState('uploading');
    setProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && json.ok) {
          setState('success');
          setProgress(100);
          onUploadComplete?.(json.data.raw_video_url || json.data.file?.url, json.data.raw_video_storage_path || json.data.file?.path);
        } else {
          setState('error');
          setError(json.error || json.message || `Upload failed (${xhr.status})`);
        }
      } catch {
        setState('error');
        setError('Invalid response from server');
      }
    });

    xhr.addEventListener('error', () => {
      setState('error');
      setError('Network error during upload');
    });

    xhr.addEventListener('abort', () => {
      setState('idle');
      setProgress(0);
    });

    xhr.open('POST', `/api/content-items/${contentItemId}/raw-video`);
    xhr.send(formData);
  }, [contentItemId, onUploadComplete]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  };

  const handleCancel = () => {
    xhrRef.current?.abort();
    setState('idle');
    setProgress(0);
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/raw-video`, { method: 'DELETE' });
      const json = await res.json();
      if (json.ok) {
        setState('idle');
        setFileName(null);
        setProgress(0);
        onRemove?.();
      } else {
        setError(json.error || 'Failed to remove video');
      }
    } catch {
      setError('Network error');
    } finally {
      setRemoving(false);
    }
  };

  const handleRetry = () => {
    setState('idle');
    setError(null);
    setProgress(0);
  };

  // ── Success state ──────────────────────────────────────────
  if (state === 'success' || (currentUrl && state === 'idle')) {
    const displayUrl = currentUrl;
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
          <span className="text-sm text-emerald-300 font-medium truncate">
            {fileName || 'Raw video attached'}
          </span>
        </div>
        {displayUrl && (
          <video
            src={displayUrl}
            controls
            preload="metadata"
            className="w-full rounded max-h-48 bg-black"
            onLoadedMetadata={(e) => {
              const dur = (e.target as HTMLVideoElement).duration;
              if (dur && isFinite(dur) && onDurationDetected) {
                onDurationDetected(Math.round(dur * 100) / 100);
              }
            }}
          />
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setState('idle'); setError(null); }}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition"
          >
            Replace
          </button>
          <button
            onClick={handleRemove}
            disabled={removing}
            className="text-xs text-red-400 hover:text-red-300 transition flex items-center gap-1 disabled:opacity-50"
          >
            {removing ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
            Remove
          </button>
        </div>
      </div>
    );
  }

  // ── Uploading state ────────────────────────────────────────
  if (state === 'uploading') {
    return (
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Loader2 size={16} className="text-blue-400 animate-spin flex-shrink-0" />
            <span className="text-sm text-blue-300 truncate">{fileName}</span>
          </div>
          <button onClick={handleCancel} className="text-zinc-500 hover:text-zinc-300 transition flex-shrink-0">
            <X size={14} />
          </button>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-1.5">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[11px] text-zinc-500">{progress}% uploaded</p>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
        <button
          onClick={handleRetry}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Idle / drop zone ───────────────────────────────────────
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`rounded-lg border-2 border-dashed p-4 cursor-pointer transition text-center space-y-2
        ${dragOver
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50 hover:bg-zinc-900'
        }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.mov,.webm,.avi,video/mp4,video/quicktime,video/webm,video/x-msvideo"
        onChange={handleFileSelect}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-1.5">
        {dragOver ? (
          <Film size={24} className="text-blue-400" />
        ) : (
          <Upload size={24} className="text-zinc-500" />
        )}
        <p className="text-sm text-zinc-400">
          {dragOver ? 'Drop video here' : 'Upload raw video'}
        </p>
        <p className="text-[11px] text-zinc-600">
          MP4, MOV, WebM, AVI &middot; Max {MAX_SIZE_MB} MB
        </p>
      </div>
    </div>
  );
}
