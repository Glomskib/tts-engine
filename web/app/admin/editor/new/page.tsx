'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AdminPageLayout from '../../components/AdminPageLayout';
import { Upload, ArrowLeft, Zap, Target, ShoppingBag, Mic, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { uploadResumableToSupabase } from '@/lib/editor/resumable-upload';

type Mode = 'quick' | 'hook' | 'ugc' | 'talking_head';
type Platform = 'tiktok_shop' | 'tiktok' | 'yt_shorts' | 'yt_long' | 'ig_reels';

// Keep in sync with server validation in /api/editor/jobs/[id]/upload/route.ts
const RAW_MAX = 500 * 1024 * 1024;
const MUSIC_MAX = 20 * 1024 * 1024;
const IMAGE_MAX = 10 * 1024 * 1024;
const RAW_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const MUSIC_MIMES = new Set(['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/mp3']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BROLL_MIMES = new Set([...RAW_MIMES, ...IMAGE_MIMES]);

function mb(b: number) { return `${Math.round(b / (1024 * 1024))} MB`; }

function validateFile(
  file: File,
  kind: 'raw' | 'broll' | 'product' | 'music',
): string | null {
  if (kind === 'raw') {
    if (file.size > RAW_MAX) return `${file.name} is ${mb(file.size)} — raw clips must be under ${mb(RAW_MAX)}.`;
    if (file.type && !RAW_MIMES.has(file.type)) return `${file.name}: raw clips must be .mp4, .mov, or .webm (got ${file.type}).`;
  } else if (kind === 'broll') {
    if (file.size > RAW_MAX) return `${file.name} is ${mb(file.size)} — b-roll must be under ${mb(RAW_MAX)}.`;
    if (file.type && !BROLL_MIMES.has(file.type)) return `${file.name}: b-roll must be video or image (got ${file.type}).`;
  } else if (kind === 'product') {
    if (file.size > IMAGE_MAX) return `${file.name} is ${mb(file.size)} — product images must be under ${mb(IMAGE_MAX)}.`;
    if (file.type && !IMAGE_MIMES.has(file.type)) return `${file.name}: product must be a jpeg/png/webp image (got ${file.type}).`;
  } else if (kind === 'music') {
    if (file.size > MUSIC_MAX) return `${file.name} is ${mb(file.size)} — music files must be under ${mb(MUSIC_MAX)}.`;
    if (file.type && !MUSIC_MIMES.has(file.type)) return `${file.name}: music must be mp3/wav/m4a (got ${file.type}).`;
  }
  return null;
}

const MODES: { id: Mode; name: string; tagline: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'quick',        name: 'Quick Cut',         tagline: 'Trim silences',          desc: 'Cuts dead space. No captions, no overlays. Fastest path to a usable clip.',                  icon: Zap },
  { id: 'hook',         name: 'Punchy Hook',       tagline: 'Stop the scroll',        desc: 'Big yellow hook caption in the first 3s, jump cuts, burned captions all the way through.', icon: Target },
  { id: 'ugc',          name: 'Shop Demo',         tagline: 'TikTok Shop ready',      desc: 'Silence trim + captions + product overlay + soft music bed. The flagship for affiliates.', icon: ShoppingBag },
  { id: 'talking_head', name: 'Clean Talking Head',tagline: 'Just the words',         desc: 'Aggressive silence trim + burned captions. No music, no overlays. Pure delivery.',           icon: Mic },
];

const PLATFORMS: { id: Platform; name: string; aspect: string }[] = [
  { id: 'tiktok_shop', name: 'TikTok Shop', aspect: '9:16' },
  { id: 'tiktok',      name: 'TikTok',      aspect: '9:16' },
  { id: 'yt_shorts',   name: 'YT Shorts',   aspect: '9:16' },
  { id: 'ig_reels',    name: 'IG Reels',    aspect: '9:16' },
  { id: 'yt_long',     name: 'YouTube',     aspect: '16:9' },
];

interface UploadProgress {
  fileName: string;
  kind: string;
  pct: number;
  status: 'queued' | 'signing' | 'uploading' | 'finalizing' | 'done' | 'error';
  /** Live transfer rate (bytes/sec) while uploading. */
  bytesPerSecond?: number;
  /** Estimated seconds remaining while uploading. */
  etaSeconds?: number | null;
  error?: string;
}

function fmtSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  const mbps = bytesPerSec / (1024 * 1024);
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`;
  return `${Math.round(bytesPerSec / 1024)} KB/s`;
}

function fmtEta(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return `~${seconds}s left`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `~${m}m ${s.toString().padStart(2, '0')}s left`;
}

/**
 * Upload a single file directly to Supabase Storage using TUS resumable uploads.
 *
 * Why TUS and not a plain signed-URL PUT:
 * Supabase's standard signed-URL upload is hard-capped at ~50 MB per request,
 * even on Pro plans. Anything bigger returns HTTP 413. Brandon hit this with
 * a 124 MB MP4 on 2026-05-10. TUS resumable uploads chunk the file (6 MB at a
 * time) and accept up to the bucket's fileSizeLimit (500 MB for `edit-jobs`).
 *
 * Flow:
 *   1. /api/editor/jobs/[id]/upload/sign — server validates size/mime + returns storagePath
 *   2. tus-js-client → Supabase /storage/v1/upload/resumable — chunked, resumable
 *   3. /api/editor/jobs/[id]/upload/finalize — server verifies + registers the asset
 *
 * Network drop mid-upload: tus-js-client resumes from the last completed chunk.
 * Sign + finalize are cheap, deterministic — they don't retry here.
 */
interface ProgressTelemetry { bytesPerSecond?: number; etaSeconds?: number | null }

async function uploadViaResumable(
  jobId: string,
  kind: 'raw' | 'broll' | 'product' | 'music',
  file: File,
  onProgress: (pct: number, phase: UploadProgress['status'], telemetry?: ProgressTelemetry) => void,
): Promise<void> {
  // 1. Sign — server-validates size + mime AND returns the canonical storagePath.
  //    We don't actually use the signedUrl on the TUS path; the storagePath
  //    is what we hand to TUS as the object name.
  onProgress(0, 'signing');
  const signRes = await fetch(`/api/editor/jobs/${jobId}/upload/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, name: file.name, size: file.size, type: file.type }),
  });
  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({ error: 'Sign request failed' }));
    throw new Error(err.error || `Sign request failed (${signRes.status})`);
  }
  const sign = await signRes.json();

  // 2. Resumable upload via TUS — bypasses the 50 MB cap, supports 500 MB files.
  onProgress(0, 'uploading');
  try {
    await uploadResumableToSupabase({
      bucketName: 'edit-jobs',
      storagePath: sign.storagePath,
      file,
      onProgress: (p) => onProgress(p.pct, 'uploading', { bytesPerSecond: p.bytesPerSecond, etaSeconds: p.etaSeconds }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    throw new Error(msg);
  }

  // 3. Finalize — verifies the file landed and registers the asset on the job.
  onProgress(100, 'finalizing');
  const finRes = await fetch(`/api/editor/jobs/${jobId}/upload/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storagePath: sign.storagePath, kind, name: file.name }),
  });
  if (!finRes.ok) {
    const err = await finRes.json().catch(() => ({ error: 'Finalize failed' }));
    throw new Error(err.error || `Finalize failed (${finRes.status})`);
  }
  onProgress(100, 'done');
}

export default function NewEditJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetJobId = searchParams.get('job');

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<Mode>('ugc');
  const [platform, setPlatform] = useState<Platform>('tiktok_shop');
  const [notes, setNotes] = useState('');
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [brollFiles, setBrollFiles] = useState<File[]>([]);
  const [productFile, setProductFile] = useState<File | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function setUploadProgress(name: string, kind: string, pct: number, phase: UploadProgress['status'], telemetry?: ProgressTelemetry, error?: string) {
    setUploads((prev) => {
      const idx = prev.findIndex((u) => u.fileName === name && u.kind === kind);
      const next = idx >= 0 ? [...prev] : [...prev, { fileName: name, kind, pct: 0, status: 'queued' as const }];
      const target = idx >= 0 ? next[idx] : next[next.length - 1];
      target.pct = pct;
      target.status = phase;
      if (telemetry) {
        target.bytesPerSecond = telemetry.bytesPerSecond;
        target.etaSeconds = telemetry.etaSeconds;
      }
      if (error) target.error = error;
      return next;
    });
  }

  async function handleSubmit() {
    if (rawFiles.length === 0) { setStatus('Please add at least one raw clip.'); return; }

    // Client-side validation — fail fast
    const allPairs: Array<{ kind: 'raw' | 'broll' | 'product' | 'music'; file: File }> = [
      ...rawFiles.map((f) => ({ kind: 'raw' as const, file: f })),
      ...brollFiles.map((f) => ({ kind: 'broll' as const, file: f })),
    ];
    if (productFile) allPairs.push({ kind: 'product', file: productFile });
    if (musicFile) allPairs.push({ kind: 'music', file: musicFile });

    for (const p of allPairs) {
      const err = validateFile(p.file, p.kind);
      if (err) { setStatus(err); return; }
    }

    setSubmitting(true);
    setStatus('Setting up your edit…');
    setUploads(allPairs.map((p) => ({ fileName: p.file.name, kind: p.kind, pct: 0, status: 'queued' as const })));

    try {
      let jobId = presetJobId;
      if (!jobId) {
        const createRes = await fetch('/api/editor/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || 'Untitled Edit',
            mode,
            mode_options: { platform, notes },
          }),
        });
        if (!createRes.ok) throw new Error('Failed to create job');
        const j = await createRes.json();
        jobId = j.job.id;
      }

      setStatus('Uploading your video…');
      // Upload all files in parallel — direct to Supabase Storage via signed URL
      await Promise.all(
        allPairs.map(async (p) => {
          try {
            await uploadViaResumable(jobId!, p.kind, p.file, (pct, phase, telemetry) => {
              setUploadProgress(p.file.name, p.kind, pct, phase, telemetry);
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Upload failed';
            setUploadProgress(p.file.name, p.kind, 0, 'error', undefined, msg);
            throw e;
          }
        })
      );

      setStatus('Starting your edit…');
      // Wait for the start call so we can surface 429 / 4xx errors to the user
      // BEFORE redirecting. Previously this was fire-and-forget — users hit
      // their daily limit and landed on a "draft" job with no explanation.
      try {
        const startRes = await fetch(`/api/editor/jobs/${jobId}/start`, { method: 'POST' });
        if (!startRes.ok) {
          const data = await startRes.json().catch(() => ({}));
          if (startRes.status === 429 && data.upgrade) {
            setStatus(data.subtext || data.headline || 'Daily edit limit reached — upgrade for more.');
            setSubmitting(false);
            return;
          }
          // Soft-fail: still navigate so the user sees the job + can retry from there.
          setStatus(data.error || `Couldn't start edit (${startRes.status}). Try Retry from the job page.`);
        }
      } catch {
        // Network error on the start call — still navigate, the detail page
        // has a Retry button that re-enqueues.
      }
      router.push(`/admin/editor/${jobId}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
      setSubmitting(false);
    }
  }

  return (
    <AdminPageLayout title="New AI Edit" subtitle="Upload raw footage. Pick a mode + platform. Get a finished video.">
      <div className="mb-4">
        <Link href="/admin/editor" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="w-4 h-4" /> Back to jobs
        </Link>
      </div>

      <div className="space-y-6 max-w-3xl">
        <div>
          <label className="block text-sm text-zinc-300 mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Whitening strips demo — take 1"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100"
          />
        </div>

        <FileInput
          label="Raw footage (required, .mp4/.mov/.webm — up to 500 MB each)"
          multiple
          accept="video/*"
          files={rawFiles}
          onChange={setRawFiles}
        />

        <FileInput
          label="B-roll (optional)"
          multiple
          accept="video/*,image/*"
          files={brollFiles}
          onChange={setBrollFiles}
        />

        <SingleFileInput
          label="Product image (optional — used by Shop Demo mode)"
          accept="image/*"
          file={productFile}
          onChange={setProductFile}
        />

        <SingleFileInput
          label="Music bed (optional — used by Shop Demo mode)"
          accept="audio/*"
          file={musicFile}
          onChange={setMusicFile}
        />

        <div>
          <label className="block text-sm text-zinc-300 mb-2">Edit Mode</label>
          <div className="grid sm:grid-cols-2 gap-3">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`text-left rounded-lg border p-4 transition ${active ? 'border-teal-500 bg-teal-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-teal-400" />
                    <div className="font-medium text-zinc-100">{m.name}</div>
                    <span className="ml-auto text-[11px] text-zinc-500">{m.tagline}</span>
                  </div>
                  <div className="text-xs text-zinc-400">{m.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-2">Posting Platform</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const active = platform === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className={`text-sm rounded-lg border px-3 py-1.5 transition ${active ? 'border-teal-500 bg-teal-500/10 text-teal-200' : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700'}`}
                >
                  {p.name} <span className="text-[11px] text-zinc-500">{p.aspect}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-1">Notes for the editor (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={'Tell the AI anything — examples:\n• "Goal: drive product clicks"\n• "I flubbed at 0:14, skip that take"\n• "Lead with the price — $19"\n• "Avoid medical claims"\n• "Keep it under 25 seconds"'}
            rows={4}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
          <div className="mt-1 text-[11px] text-zinc-500">These notes guide the AI's edit choices — what to keep, cut, emphasize, or avoid.</div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || rawFiles.length === 0}
            aria-label={submitting ? 'Edit in progress, please wait' : 'Start the AI edit'}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-5 py-2.5 text-sm font-medium text-white"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Upload className="w-4 h-4" aria-hidden="true" />}
            {submitting ? 'Uploading…' : 'Start Edit'}
          </button>
          {status && <span role="status" aria-live="polite" className="text-xs text-zinc-400">{status}</span>}
        </div>

        {uploads.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
            <div className="text-sm text-zinc-300 font-medium">Upload progress</div>
            {uploads.map((u) => (
              <div key={`${u.kind}-${u.fileName}`} className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  {u.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                  {u.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                  {(u.status === 'uploading' || u.status === 'signing' || u.status === 'finalizing') && <Loader2 className="w-3.5 h-3.5 text-teal-400 animate-spin" />}
                  <span className="text-zinc-300 truncate flex-1">{u.fileName}</span>
                  {u.status === 'uploading' ? (
                    <span className="text-zinc-500 tabular-nums whitespace-nowrap">
                      {u.pct}%
                      {fmtSpeed(u.bytesPerSecond) && <span className="text-zinc-600"> · {fmtSpeed(u.bytesPerSecond)}</span>}
                      {fmtEta(u.etaSeconds) && <span className="text-zinc-600"> · {fmtEta(u.etaSeconds)}</span>}
                    </span>
                  ) : (
                    <span className="text-zinc-500">{u.status}</span>
                  )}
                </div>
                {(u.status === 'uploading' || u.status === 'finalizing' || u.status === 'done') && (
                  <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full transition-all ${u.status === 'done' ? 'bg-green-500' : 'bg-teal-500'}`}
                      style={{ width: `${u.pct}%` }}
                    />
                  </div>
                )}
                {u.error && <div className="text-[11px] text-red-400">{u.error}</div>}
              </div>
            ))}
            {submitting && (
              <div className="pt-2 mt-2 border-t border-zinc-800 text-[11px] text-zinc-500 leading-relaxed">
                <strong className="text-zinc-400">While you wait:</strong> after upload finishes, transcription + AI edit + render takes about 1–3 minutes per minute of footage. You can leave this page — we'll save the job. Check back at the editor list anytime.
              </div>
            )}
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
}

function FileInput({
  label, multiple, accept, files, onChange,
}: { label: string; multiple?: boolean; accept?: string; files: File[]; onChange: (f: File[]) => void }) {
  return (
    <div>
      <label className="block text-sm text-zinc-300 mb-1">{label}</label>
      <input
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={(e) => onChange(Array.from(e.target.files ?? []))}
        className="block w-full text-sm text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700"
      />
      {files.length > 0 && (
        <div className="mt-1 text-xs text-zinc-500">{files.map((f) => `${f.name} (${mb(f.size)})`).join(', ')}</div>
      )}
    </div>
  );
}

function SingleFileInput({
  label, accept, file, onChange,
}: { label: string; accept?: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div>
      <label className="block text-sm text-zinc-300 mb-1">{label}</label>
      <input
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700"
      />
      {file && <div className="mt-1 text-xs text-zinc-500">{file.name} ({mb(file.size)})</div>}
    </div>
  );
}
