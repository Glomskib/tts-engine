'use client';

/**
 * SendToEditorModal — collects the raw footage (and optional product + music)
 * needed for the AI video editor BEFORE any edit_jobs row is created.
 *
 * This component is the sole entry point for the "Send to AI Video Editor"
 * action from the pipeline detail page. It NEVER creates a draft job up
 * front — the row is only inserted server-side once a valid raw video has
 * been selected and submitted via /api/editor/jobs/from-pipeline.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  UploadCloud,
  FileVideo,
  Image as ImageIcon,
  Music,
  Zap,
  Target,
  ShoppingBag,
  Mic,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  EDITOR_ASSET_LIMITS,
  validateEditorAsset,
  formatMB,
} from '@/lib/editor/validation';

type Mode = 'quick' | 'hook' | 'ugc' | 'talking_head';

interface SendToEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: string;
  defaultTitle?: string;
}

const MODES: {
  id: Mode;
  name: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'quick',        name: 'Quick',             desc: 'Trim silences, straight cut.',            icon: Zap },
  { id: 'hook',         name: 'Hook-Focused',      desc: 'Big hook caption, jump cuts, captions.',  icon: Target },
  { id: 'ugc',          name: 'UGC Product',       desc: 'Captions + product overlay + music bed.', icon: ShoppingBag },
  { id: 'talking_head', name: 'Talking Head Clean',desc: 'Aggressive silence trim + captions.',     icon: Mic },
];

export default function SendToEditorModal({
  isOpen,
  onClose,
  pipelineId,
  defaultTitle,
}: SendToEditorModalProps) {
  const router = useRouter();

  const [rawFile, setRawFile] = useState<File | null>(null);
  const [productFile, setProductFile] = useState<File | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('hook');
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const rawInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the modal opens so it never shows stale selections.
  useEffect(() => {
    if (isOpen) {
      setRawFile(null);
      setProductFile(null);
      setMusicFile(null);
      setMode('hook');
      setSubmitting(false);
      setStatusText('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const rawError = rawFile ? validateEditorAsset('raw', { size: rawFile.size, type: rawFile.type, name: rawFile.name }) : null;
  const productError = productFile ? validateEditorAsset('product', { size: productFile.size, type: productFile.type, name: productFile.name }) : null;
  const musicError = musicFile ? validateEditorAsset('music', { size: musicFile.size, type: musicFile.type, name: musicFile.name }) : null;

  const canSubmit = !!rawFile && !rawError && !productError && !musicError && !submitting;

  function handleRawSelected(files: FileList | null) {
    const f = files?.[0] ?? null;
    setRawFile(f);
    setError(null);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleRawSelected(e.dataTransfer.files);
  }

  async function handleSubmit() {
    if (!rawFile || rawError) return;
    setSubmitting(true);
    setError(null);
    setStatusText('Uploading footage…');

    try {
      const fd = new FormData();
      fd.append('pipeline_id', pipelineId);
      fd.append('mode', mode);
      if (defaultTitle) fd.append('title', defaultTitle);
      fd.append('raw', rawFile);
      if (productFile) fd.append('product', productFile);
      if (musicFile) fd.append('music', musicFile);

      const res = await fetch('/api/editor/jobs/from-pipeline', {
        method: 'POST',
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        throw new Error(j.error || `Request failed (${res.status}).`);
      }

      setStatusText('Starting editor…');
      router.push(`/admin/editor/${j.job_id}?just_created=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSubmitting(false);
      setStatusText('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center shrink-0">
              <UploadCloud className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Upload footage to generate your video</h2>
              <p className="text-sm text-zinc-400 mt-0.5">
                FlashFlow needs your raw clip to edit. Optionally add a product image or music.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Raw footage drop zone */}
          <div>
            <label className="block text-sm text-zinc-300 mb-2">
              Raw footage <span className="text-red-400">*</span>
            </label>
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => rawInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors ${
                isDragging
                  ? 'border-teal-500 bg-teal-500/10'
                  : rawFile && !rawError
                    ? 'border-teal-700 bg-teal-500/5'
                    : 'border-zinc-700 bg-zinc-900/40 hover:border-zinc-600'
              }`}
            >
              <input
                ref={rawInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => handleRawSelected(e.target.files)}
              />
              {rawFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileVideo className="w-8 h-8 text-teal-400" />
                  <div className="text-sm text-zinc-100 font-medium break-all">{rawFile.name}</div>
                  <div className="text-xs text-zinc-500">{formatMB(rawFile.size)}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      rawInputRef.current?.click();
                    }}
                    className="text-xs text-teal-400 hover:text-teal-300 underline"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-400">
                  <UploadCloud className="w-8 h-8" />
                  <div className="text-sm">Drag &amp; drop a video here, or click to browse</div>
                  <div className="text-xs text-zinc-500">
                    .mp4, .mov, or .webm — up to {formatMB(EDITOR_ASSET_LIMITS.raw.maxBytes)}
                  </div>
                </div>
              )}
            </div>
            {rawError && (
              <div className="mt-2 flex items-start gap-2 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{rawError}</span>
              </div>
            )}
          </div>

          {/* Optional inputs */}
          <div className="grid sm:grid-cols-2 gap-4">
            <OptionalFileField
              label="Product image (optional)"
              hint={`jpeg/png/webp, ≤ ${formatMB(EDITOR_ASSET_LIMITS.product.maxBytes)}`}
              icon={ImageIcon}
              accept="image/jpeg,image/png,image/webp"
              file={productFile}
              error={productError}
              inputRef={productInputRef}
              onChange={(f) => setProductFile(f)}
            />
            <OptionalFileField
              label="Music (optional)"
              hint={`mp3/wav/m4a, ≤ ${formatMB(EDITOR_ASSET_LIMITS.music.maxBytes)}`}
              icon={Music}
              accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/mp3"
              file={musicFile}
              error={musicError}
              inputRef={musicInputRef}
              onChange={(f) => setMusicFile(f)}
            />
          </div>

          {/* Mode picker */}
          <div>
            <label className="block text-sm text-zinc-300 mb-2">Edit mode</label>
            <div className="grid sm:grid-cols-2 gap-3">
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`text-left rounded-lg border p-3 transition ${
                      active
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-teal-400" />
                      <div className="font-medium text-zinc-100 text-sm">{m.name}</div>
                    </div>
                    <div className="text-xs text-zinc-400">{m.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-red-900 bg-red-950/40 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-950/50">
          <div className="text-xs text-zinc-500 min-h-[1rem]">
            {submitting && statusText ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                {statusText}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              Start Editing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionalFileField({
  label,
  hint,
  icon: Icon,
  accept,
  file,
  error,
  inputRef,
  onChange,
}: {
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  accept: string;
  file: File | null;
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (f: File | null) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      <div
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border px-3 py-3 transition-colors ${
          file && !error
            ? 'border-teal-700 bg-teal-500/5'
            : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <Icon className="w-4 h-4 text-zinc-400" />
          {file ? (
            <span className="truncate">{file.name} <span className="text-zinc-500">({formatMB(file.size)})</span></span>
          ) : (
            <span className="text-zinc-500">Click to choose…</span>
          )}
        </div>
        <div className="text-[11px] text-zinc-600 mt-1">{hint}</div>
      </div>
      {file && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1 text-[11px] text-zinc-500 hover:text-zinc-300 underline"
        >
          Remove
        </button>
      )}
      {error && (
        <div className="mt-1 flex items-start gap-1 text-[11px] text-red-400">
          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
