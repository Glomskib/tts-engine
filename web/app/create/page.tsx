'use client';

/**
 * /create — the canonical AI clip tool.
 *
 * Two modes, one tool:
 *   - Post Maker: TikTok/Reels/Shorts creators. 1-3 source takes, 1-2 polished
 *     outputs per platform. Multi-file upload. Karaoke captions, music, B-roll
 *     auto-tuned to the chosen vibe.
 *   - Clip Picker: long-form creators (podcasts, interviews, streams). 1 long
 *     source, 5-10 ranked clips out, each standalone.
 *
 * Same backend pipeline (ve_runs), different defaults + UI presentation.
 * Storage backend: Cloudflare R2 when configured, Supabase fallback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import BrandPickerModal from '@/components/create/BrandPickerModal';
import {
  Mic, Upload, Link as LinkIcon, Video, Loader2, AlertTriangle, Sparkles,
  X, ChevronRight,
} from 'lucide-react';
import { RenderAgentBadge } from '@/components/admin/RenderAgentBadge';
import CreateOnboarding from '@/components/CreateOnboarding';
import { useAuth } from '@/contexts/AuthContext';

type Mode = 'post' | 'clip';
type Entry = 'record' | 'upload' | 'link' | 'drive';
type Vibe = 'hype' | 'calm' | 'real' | 'funny' | 'sad' | 'custom';

const VIBES: { key: Vibe; label: string; emoji: string; hint: string }[] = [
  { key: 'hype',  label: 'Hype',  emoji: '⚡', hint: 'High energy, fast cuts, big captions' },
  { key: 'calm',  label: 'Calm',  emoji: '🌿', hint: 'Slow pacing, soft captions, breathing room' },
  { key: 'real',  label: 'Real',  emoji: '🎙️', hint: 'Plain talk, no hype, friend-to-friend' },
  { key: 'funny', label: 'Funny', emoji: '😂', hint: 'Punchy beats, comedic timing on cuts' },
  { key: 'sad',   label: 'Sad',   emoji: '💔', hint: 'Heavy moments, minor key, lingering shots' },
];

/**
 * Caption style registry. Each entry carries the metadata for the picker AND
 * a `renderPreview()` that draws a stylized mini-mockup of what that caption
 * looks like over a video frame. The mockups are CSS — no images — so they
 * load instantly and stay sharp on any DPI.
 */
const CAPTION_STYLES: {
  key: string;
  label: string;
  preview: string;
  /** A tiny mock of the caption rendered on a mock video frame. */
  renderPreview: () => React.ReactNode;
}[] = [
  {
    key: 'karaoke',
    label: 'Karaoke',
    preview: 'Word-by-word highlight — highest retention',
    renderPreview: () => (
      <div className="flex items-center justify-center gap-1 font-extrabold text-base">
        <span className="text-white">THIS</span>
        <span className="text-yellow-400 bg-black/70 px-1 rounded">HOOK</span>
        <span className="text-white/50">SLAPS</span>
      </div>
    ),
  },
  {
    key: 'bold_yellow',
    label: 'Bold Yellow',
    preview: 'Big yellow with black stroke',
    renderPreview: () => (
      <div
        className="text-yellow-400 font-black text-lg tracking-tight"
        style={{ WebkitTextStroke: '1.5px black', textShadow: '0 2px 6px rgba(0,0,0,0.8)' }}
      >
        THIS HOOK
      </div>
    ),
  },
  {
    key: 'subtle_white',
    label: 'Subtle White',
    preview: 'Clean white, no fuss',
    renderPreview: () => (
      <div className="text-white font-medium text-sm" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
        this hook is clean
      </div>
    ),
  },
  {
    key: 'mr_beast',
    label: 'MrBeast Big',
    preview: 'Huge bold with thick outline',
    renderPreview: () => (
      <div
        className="text-white font-black text-xl tracking-tight uppercase"
        style={{ WebkitTextStroke: '2px black', textShadow: '0 3px 8px rgba(0,0,0,0.9)' }}
      >
        WAIT FOR IT
      </div>
    ),
  },
  {
    key: 'newscast',
    label: 'Two-Line News',
    preview: 'Bottom 2-line styled bar',
    renderPreview: () => (
      <div className="absolute bottom-1 left-1 right-1 bg-red-700 text-white text-[10px] font-bold uppercase px-2 py-1 leading-tight tracking-wide">
        BREAKING<br />THIS HOOK
      </div>
    ),
  },
  {
    key: 'slow_reader',
    label: 'Slow Reader',
    preview: 'Bigger text, slower pace',
    renderPreview: () => (
      <div className="text-white font-semibold text-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.7)' }}>
        this · hook · is · slow
      </div>
    ),
  },
];

interface CreditState { remaining: number; isUnlimited: boolean; plan: string }

interface UploadedSource {
  filename: string;
  signedUrl: string;     // upload PUT target (no longer needed once upload done)
  readUrl: string;       // GET URL for the pipeline
  storagePath: string;
  backend: string;
  sizeBytes: number;
  progress: number;      // 0-100
  done: boolean;
}

/** Mode-specific defaults — picked for "best practices" per platform. */
const MODE_DEFAULTS: Record<Mode, {
  label: string;
  blurb: string;
  clipCount: number;
  aspectRatios: string[];
  captionStyle: string;
  vibe: Vibe;
  maxSources: number;
  minSources: number;
  promptPlaceholder: string;
}> = {
  post: {
    label: 'Post Maker',
    blurb: 'TikTok / Reels / Shorts. Polish a take (or pick from a few) into one ready-to-post clip.',
    clipCount: 1,
    aspectRatios: ['9:16'],
    captionStyle: 'karaoke',
    vibe: 'real',
    maxSources: 5,
    minSources: 1,
    promptPlaceholder: 'What\'s the post about? e.g. "review of my new gravel bike — focus on the climb at the end"',
  },
  clip: {
    label: 'Clip Picker',
    blurb: 'Long video → short clips. 5-10 highlights with feel scores, each one standalone.',
    clipCount: 5,
    aspectRatios: ['9:16'],
    captionStyle: 'bold_yellow',
    vibe: 'real',
    maxSources: 1,
    minSources: 1,
    promptPlaceholder: 'What kind of clips? e.g. "the 3 most insightful moments" or "every time the guest laughs"',
  },
};

export default function CreatePage() {
  // Admin gate for internal-only badges (render fleet, etc).
  const { isAdmin } = useAuth();

  // ── Mode + defaults ────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('post');
  const defaults = MODE_DEFAULTS[mode];

  // ── Inputs ─────────────────────────────────────────────────────────────
  const [entry, setEntry] = useState<Entry>('upload');
  const [describe, setDescribe] = useState('');
  const [vibe, setVibe] = useState<Vibe>(defaults.vibe);
  const [customVibe, setCustomVibe] = useState('');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [captionStyle, setCaptionStyle] = useState<string>(defaults.captionStyle);
  const [clipCount, setClipCount] = useState(defaults.clipCount);
  const [aspectRatios, setAspectRatios] = useState<string[]>(defaults.aspectRatios);

  // ── Sources (multi-file capable) ───────────────────────────────────────
  const [sources, setSources] = useState<UploadedSource[]>([]);
  const [linkValue, setLinkValue] = useState('');
  const [creating, setCreating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditState | null>(null);
  const [recording, setRecording] = useState(false);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  // Polish: defaults to OFF so we don't quietly add B-roll/music to every clip.
  // Brandon's call — make these explicit opt-in instead of auto-applied.
  const [enableBroll, setEnableBroll] = useState(false);
  const [enableMusic, setEnableMusic] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // When mode changes, apply mode defaults (only override if user hasn't customized)
  useEffect(() => {
    setClipCount(MODE_DEFAULTS[mode].clipCount);
    setAspectRatios(MODE_DEFAULTS[mode].aspectRatios);
    setCaptionStyle(MODE_DEFAULTS[mode].captionStyle);
    setVibe(MODE_DEFAULTS[mode].vibe);
  }, [mode]);

  // Load credits + brand profiles
  useEffect(() => {
    void (async () => {
      try {
        const c = await fetch('/api/credits/balance', { cache: 'no-store' }).then((r) => r.json());
        if (c?.ok) setCredits({ remaining: c.remaining, isUnlimited: c.isUnlimited, plan: c.plan });
      } catch (e) {
        console.warn('Create page init load failed', e);
      }
    })();
  }, []);

  // ── Resume an in-progress job ──────────────────────────────────────────
  // If the user arrives at /create?job=<id> (from an email/notification) OR
  // there's an in-flight job stashed in sessionStorage (so a page refresh
  // doesn't drop them back into an empty upload form), surface the
  // JobProgress view instead of the upload form.
  //
  // Was a bug: previously hitting /create while a job was running just
  // showed a blank upload screen — users thought their job vanished.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('job');
    const fromStorage = sessionStorage.getItem('ff_active_job');
    const candidate = fromQuery || fromStorage;
    if (!candidate) return;
    // Validate the job still exists + isn't terminal. If terminal (done /
    // failed), drop the stashed value and let the user see the upload form.
    void (async () => {
      try {
        const res = await fetch(`/api/create/jobs/${encodeURIComponent(candidate)}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          sessionStorage.removeItem('ff_active_job');
          return;
        }
        const data = await res.json();
        const status = data?.status as string | undefined;
        const terminal = status === 'done' || status === 'failed' || status === 'completed';
        if (terminal) {
          // For a finished job from an email link, send them straight to /clips
          // so they can see the output. For a stashed-but-stale id, just clear it.
          if (fromQuery) {
            window.location.replace('/clips');
            return;
          }
          sessionStorage.removeItem('ff_active_job');
          return;
        }
        setJobId(candidate);
      } catch {
        sessionStorage.removeItem('ff_active_job');
      }
    })();
  }, []);

  // Stash / clear the active job id so a refresh resumes the progress view.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (jobId) {
      sessionStorage.setItem('ff_active_job', jobId);
    } else {
      sessionStorage.removeItem('ff_active_job');
    }
  }, [jobId]);

  // ── Cost preview ───────────────────────────────────────────────────────
  // Post Maker: 1 credit per platform (aspect ratio). Clip Picker: 1 per clip × aspects.
  const creditCost = mode === 'post'
    ? aspectRatios.length
    : clipCount * aspectRatios.length;

  // ── Upload one file (called per file in multi-file flow) ───────────────
  const uploadOneFile = useCallback(async (file: File): Promise<UploadedSource | null> => {
    const placeholder: UploadedSource = {
      filename: file.name,
      signedUrl: '',
      readUrl: '',
      storagePath: '',
      backend: '',
      sizeBytes: file.size,
      progress: 0,
      done: false,
    };
    setSources((prev) => [...prev, placeholder]);
    const idx = sources.length; // index of just-pushed item (approximate)

    try {
      const reqResp = await fetch('/api/create/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime: file.type, size: file.size }),
      });
      const reqJson = await reqResp.json();
      if (!reqResp.ok || !reqJson.ok) {
        setError(reqJson.error || 'Could not start upload.');
        setSources((prev) => prev.filter((s) => s.filename !== file.name || s.done));
        return null;
      }

      // PUT direct to storage
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', reqJson.signed_url, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (ev) => {
          if (!ev.lengthComputable) return;
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setSources((prev) => prev.map((s, i) => i === idx || s.filename === file.name && !s.done ? { ...s, progress: pct } : s));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve();
          let detail = '';
          try { detail = JSON.parse(xhr.responseText || '{}').message || ''; } catch { detail = xhr.responseText?.slice(0, 200) || ''; }
          const sizeMb = (file.size / 1024 / 1024).toFixed(1);
          if (xhr.status === 413 || /too large|payload/i.test(detail)) {
            return reject(new Error(`${file.name} (${sizeMb}MB) — too large for the current storage tier. Compress it first or paste a link.`));
          }
          reject(new Error(`Upload of ${file.name} failed: ${xhr.status} ${detail}`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload — check your connection.'));
        xhr.send(file);
      });

      const uploaded: UploadedSource = {
        filename: file.name,
        signedUrl: reqJson.signed_url,
        readUrl: reqJson.public_url,
        storagePath: reqJson.storage_path,
        backend: reqJson.backend,
        sizeBytes: file.size,
        progress: 100,
        done: true,
      };
      setSources((prev) => {
        // Replace placeholder by filename
        const cleaned = prev.filter((s) => !(s.filename === file.name && !s.done));
        return [...cleaned, uploaded];
      });
      return uploaded;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setSources((prev) => prev.filter((s) => !(s.filename === file.name && !s.done)));
      return null;
    }
  }, [sources.length]);

  // ── Drop / pick multiple files ─────────────────────────────────────────
  const handleMultiFile = useCallback(async (fileList: FileList | File[]) => {
    setError(null);
    const files = Array.from(fileList);
    const remaining = defaults.maxSources - sources.filter((s) => s.done).length;
    if (files.length > remaining) {
      setError(`This mode allows ${defaults.maxSources} sources max. You've already got ${sources.filter((s) => s.done).length}.`);
      return;
    }
    // Upload in parallel
    await Promise.all(files.map((f) => uploadOneFile(f)));
  }, [sources, uploadOneFile, defaults.maxSources]);

  const removeSource = useCallback((filename: string) => {
    setSources((prev) => prev.filter((s) => s.filename !== filename));
  }, []);

  // ── In-browser recording (single take, appends to sources) ────────────
  const startRecording = useCallback(async () => {
    setRecorderError(null);
    if (sources.filter((s) => s.done).length >= defaults.maxSources) {
      setRecorderError(`Already at max ${defaults.maxSources} sources for this mode.`);
      return;
    }
    // Hard pre-flight checks before requesting the camera so iOS users get
    // a useful error instead of a silent "Could not access camera/mic".
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecorderError('This browser does not support in-page recording. Use Upload instead.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setRecorderError('Recording is not supported in this browser. Use Upload instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1080 }, height: { ideal: 1920 }, facingMode: 'user' },
        audio: true,
      });
      streamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        void videoPreviewRef.current.play();
      }
      // iOS Safari supports MediaRecorder only with mp4/h264+aac. Chrome/Firefox
      // prefer webm/vp9/opus. Try the best mime each platform actually supports;
      // bail with a friendly error if none work rather than throwing.
      const candidates = [
        'video/mp4;codecs=h264,aac',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      const mime = candidates.find((c) => {
        try { return MediaRecorder.isTypeSupported(c); } catch { return false; }
      }) || '';
      let rec: MediaRecorder;
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (mrErr) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecorderError(
          mrErr instanceof Error
            ? `Recorder couldn’t start: ${mrErr.message}. Try Upload instead.`
            : 'Recorder couldn’t start. Try Upload instead.',
        );
        return;
      }
      const ext = (mime.includes('mp4') ? 'mp4' : 'webm');
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blobType = rec.mimeType || mime || `video/${ext}`;
        const blob = new Blob(chunksRef.current, { type: blobType });
        const filename = `take-${sources.filter((s) => s.done).length + 1}-${Date.now()}.${ext}`;
        await uploadOneFile(new File([blob], filename, { type: blobType }));
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      rec.start(1000);
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      // Distinguish permission-denied so users know to enable camera in Settings.
      const msg = e instanceof Error ? e.message : '';
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || /denied|permission/i.test(msg)) {
        setRecorderError('Camera/mic blocked. Allow access in your browser settings, then tap Record again.');
      } else if (name === 'NotFoundError' || /no camera|no device|not found/i.test(msg)) {
        setRecorderError('No camera found on this device. Use Upload instead.');
      } else {
        setRecorderError(msg || 'Could not access camera/mic');
      }
    }
  }, [sources, uploadOneFile, defaults.maxSources]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  // ── Submit job ─────────────────────────────────────────────────────────
  const createJob = useCallback(async () => {
    setError(null);
    const readySources = sources.filter((s) => s.done);
    if (readySources.length === 0 && !linkValue) {
      setError('Add a source first — record, upload, or paste a link.');
      return;
    }
    if (readySources.length < defaults.minSources && !linkValue) {
      setError(`Need at least ${defaults.minSources} source for ${defaults.label}.`);
      return;
    }
    setCreating(true);
    try {
      // For multi-source uploads we send the FIRST source as primary (pipeline
      // currently treats one asset per run) and stash the rest in metadata so
      // a future multi-take selector can pick. v1 ships with single-source
      // execution + the multi-file scaffolding ready.
      const primary = readySources[0];
      const body = {
        mode,
        source_url: primary?.readUrl,
        source_link: linkValue || null,
        storage_path: primary?.storagePath,
        backend: primary?.backend,
        // Additional sources go in metadata so the pipeline tick can read them later
        additional_sources: readySources.slice(1).map((s) => ({
          read_url: s.readUrl, storage_path: s.storagePath, backend: s.backend, filename: s.filename,
        })),
        describe,
        vibe: vibe === 'custom' ? customVibe : vibe,
        brand_profile_id: brandId,
        caption_style: captionStyle,
        clip_count: clipCount,
        aspect_ratios: aspectRatios,
        enable_broll: enableBroll,
        enable_music: enableMusic,
      };
      const r = await fetch('/api/create/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || 'Could not start the job. Check credits or try again.');
      } else {
        setJobId(j.job_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Job create failed');
    } finally {
      setCreating(false);
    }
  }, [sources, linkValue, mode, describe, vibe, customVibe, brandId, captionStyle, clipCount, aspectRatios, enableBroll, enableMusic, defaults]);

  // ── UI ─────────────────────────────────────────────────────────────────
  if (jobId) {
    return <JobProgress mode={mode} jobId={jobId} onNewJob={() => { setJobId(null); setSources([]); setLinkValue(''); }} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* v11-hero-polish */}
      <div className="mb-6 px-4 sm:px-0">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400" /> AI Video Editor
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-2">
          Drop footage. Get a finished short.
        </h1>
        <p className="text-zinc-400 text-sm sm:text-base max-w-2xl">
          We trim silences, beat-sync the cuts, write captions, detect retakes, and polish your hook — automatically.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {[
            'Silence trim',
            'Beat-sync cuts',
            'Auto captions',
            'Retake detection',
            'Hook polish',
            'Multi-platform export',
          ].map((chip) => (
            <span key={chip} className="px-2.5 py-1 rounded-full bg-zinc-900/60 border border-white/10 text-zinc-300">
              {chip}
            </span>
          ))}
        </div>
      </div>
      {/* First-visit onboarding tour. Self-gates on localStorage so existing
          users never see it. Dismissable any time. */}
      <CreateOnboarding />
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2">
              <Sparkles className="w-7 h-7 text-teal-400" />
              Create
            </h1>
            <p className="text-sm text-gray-400 mt-1">Record or upload. We do the rest.</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Admin-only — customers should never see "Render: No agent"
                or any internal infra status. Gated on the isAdmin flag
                from AuthContext. */}
            {isAdmin && <RenderAgentBadge />}
            {credits && (
              <div className="text-right">
                <div className="text-xs text-gray-400 uppercase tracking-wider">Credits</div>
                <div className={`text-lg font-semibold ${!credits.isUnlimited && credits.remaining <= 2 ? 'text-amber-400' : ''}`}>
                  {credits.isUnlimited ? '∞' : credits.remaining}
                </div>
                <div className="text-xs text-gray-500">{credits.plan}</div>
              </div>
            )}
          </div>
        </div>

        {/* Low-credit warning — best-in-class SaaS surfaces this BEFORE the
            user hits 402 mid-flow. Threshold: ≤2 credits, not unlimited. */}
        {credits && !credits.isUnlimited && credits.remaining <= 2 && credits.remaining > 0 && (
          <div className="mb-4 bg-amber-950/40 border border-amber-700/50 rounded-lg px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              Only {credits.remaining} credit{credits.remaining === 1 ? '' : 's'} left.{' '}
              <Link href="/pricing" className="underline font-medium hover:text-amber-100">Upgrade to keep creating →</Link>
            </div>
          </div>
        )}
        {credits && !credits.isUnlimited && credits.remaining === 0 && (
          <div className="mb-4 bg-red-950/40 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              You&apos;re out of credits.{' '}
              <Link href="/pricing" className="underline font-medium hover:text-red-100">Pick a plan →</Link>{' '}
              — your work won&apos;t process until you upgrade.
            </div>
          </div>
        )}

        {/* MODE PICKER */}
        <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-gray-900 border border-gray-800 rounded-xl">
          {(['post', 'clip'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`p-3 rounded-lg text-left transition-colors ${
                mode === m ? 'bg-teal-600/30 border border-teal-500' : 'bg-transparent hover:bg-gray-800 border border-transparent'
              }`}
            >
              <div className="font-semibold text-sm">
                {m === 'post' ? '📱 Post Maker' : '✂️ Clip Picker'}
              </div>
              <div className="text-xs text-gray-400 mt-1 leading-snug">
                {MODE_DEFAULTS[m].blurb}
              </div>
            </button>
          ))}
        </div>

        {/* 1 · SOURCES */}
        <Section title={mode === 'post' ? `1 · Your take${defaults.maxSources > 1 ? 's' : ''} (up to ${defaults.maxSources})` : '1 · Source'}>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <EntryTab active={entry === 'record'} onClick={() => setEntry('record')} icon={<Video className="w-4 h-4" />} label="Record" />
            <EntryTab active={entry === 'upload'} onClick={() => setEntry('upload')} icon={<Upload className="w-4 h-4" />} label="Upload" />
            {/* Link + Drive hidden for launch (2026-06-08): no reliable video
                downloader ingests the source yet, so link/drive jobs fail at
                transcribe ("Failed to download asset"). Re-enable once the
                yt-dlp-on-mini ingest ships. Kept in JSX so imports stay valid. */}
            {false && (<>
            <EntryTab active={entry === 'link'}   onClick={() => setEntry('link')}   icon={<LinkIcon className="w-4 h-4" />} label="Link" />
            <EntryTab active={entry === 'drive'}  onClick={() => setEntry('drive')}  icon={<Sparkles className="w-4 h-4" />} label="Drive" />
            </>)}
          </div>

          {entry === 'record' && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <video ref={videoPreviewRef} className="w-full aspect-[9/16] bg-black rounded mb-3" muted playsInline autoPlay />
              {!recording ? (
                <button
                  onClick={startRecording}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium flex items-center justify-center gap-2"
                >
                  <Video className="w-5 h-5" /> Record {mode === 'post' && sources.filter((s) => s.done).length > 0 ? `another take (${sources.filter((s) => s.done).length}/${defaults.maxSources})` : ''}
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium animate-pulse"
                >
                  ● Recording — tap to stop
                </button>
              )}
              {recorderError && (
                <div className="mt-2 text-xs text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {recorderError}
                </div>
              )}
            </div>
          )}

          {entry === 'upload' && (
            <label className="block w-full">
              <div className="border-2 border-dashed border-gray-700 hover:border-teal-500 rounded-lg p-8 text-center cursor-pointer transition-colors">
                <Upload className="w-10 h-10 mx-auto text-gray-500 mb-2" />
                <div className="text-sm font-medium">Drop video{defaults.maxSources > 1 ? '(s)' : ''} here or click to choose</div>
                <div className="text-xs text-gray-500 mt-1">MP4, MOV, WEBM — up to 2GB each{mode === 'post' ? ` · max ${defaults.maxSources} takes` : ''}</div>
              </div>
              <input
                type="file"
                accept="video/*"
                multiple={defaults.maxSources > 1}
                // No `capture` attr — on iOS Safari, setting capture forces
                // the camera-only picker and hides Photos/Files. Without it
                // the user gets the native picker: Photo Library, Take
                // Photo or Video, Choose File. The Record tab handles
                // direct camera capture; Upload is for existing media.
                className="hidden"
                onChange={(e) => e.target.files && void handleMultiFile(e.target.files)}
              />
            </label>
          )}

          {entry === 'link' && (
            <input
              type="url"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              placeholder="Paste a YouTube, Vimeo, TikTok, or direct video URL"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:border-teal-500 outline-none"
            />
          )}

          {entry === 'drive' && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-300">
              <div className="font-medium mb-1">Drive folder watcher (coming soon)</div>
              <p className="text-xs text-gray-500">Share a folder once, every new video gets processed automatically.</p>
            </div>
          )}

          {/* Source list (multi-file) */}
          {sources.length > 0 && (
            <div className="mt-3 space-y-2">
              {sources.map((s) => (
                <div key={s.filename + s.progress} className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg p-2">
                  <Video className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.filename}</div>
                    <div className="text-xs text-gray-500">
                      {(s.sizeBytes / 1024 / 1024).toFixed(1)} MB · {s.done ? '✓ ready' : `${s.progress}% uploaded`}
                    </div>
                    {!s.done && (
                      <div className="h-1 mt-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500" style={{ width: `${s.progress}%` }} />
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeSource(s.filename)} className="p-1 text-gray-500 hover:text-red-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 2 · Describe */}
        <Section title="2 · What do you want?">
          <DescribeBox value={describe} onChange={setDescribe} placeholder={defaults.promptPlaceholder} />
        </Section>

        {/* 3 · Vibe */}
        <Section title="3 · Vibe">
          <div className="flex flex-wrap gap-2">
            {VIBES.map((v) => (
              <button
                key={v.key}
                onClick={() => setVibe(v.key)}
                className={`px-3 py-2 rounded-full text-sm font-medium border ${
                  vibe === v.key ? 'bg-teal-600 border-teal-500' : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                }`}
                title={v.hint}
              >
                {v.emoji} {v.label}
              </button>
            ))}
            <button
              onClick={() => setVibe('custom')}
              className={`px-3 py-2 rounded-full text-sm font-medium border ${
                vibe === 'custom' ? 'bg-teal-600 border-teal-500' : 'bg-gray-900 border-gray-700 hover:border-gray-500'
              }`}
            >
              ＋ Custom
            </button>
          </div>
          {vibe === 'custom' && (
            <input
              type="text"
              value={customVibe}
              onChange={(e) => setCustomVibe(e.target.value)}
              placeholder='Describe your own vibe'
              className="mt-3 w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:border-teal-500 outline-none text-sm"
            />
          )}
        </Section>

        {/* 4 · Brand */}
        <Section title="4 · Brand">
          {/*
            Always use BrandPickerModal — it renders the dropdown of brands
            when present AND keeps the "New brand voice" create button
            visible. The previous branch swapped in a plain <select> when
            brands.length > 0, which dropped the create button (and meant
            users with brands couldn't add new ones from /create).
            Incident 2026-05-27.
          */}
          <BrandPickerModal selectedId={brandId} onSelect={setBrandId} />
        </Section>

        {/* 5 · Output settings */}
        <Section title={mode === 'post' ? '5 · Platforms' : '5 · Output'}>
          {mode === 'clip' && (
            <div className="mb-3">
              <label className="text-xs text-gray-400 uppercase tracking-wider">How many clips?</label>
              <input
                type="number"
                min={1}
                max={10}
                value={clipCount}
                onChange={(e) => setClipCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                className="mt-1 w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500"
              />
            </div>
          )}

          <label className="text-xs text-gray-400 uppercase tracking-wider">{mode === 'post' ? 'Platforms' : 'Aspect ratios'}</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {[
              { ar: '9:16', tag: 'TikTok · Reels · Shorts' },
              { ar: '1:1',  tag: 'IG feed' },
              { ar: '4:5',  tag: 'IG portrait' },
              { ar: '16:9', tag: 'X · LinkedIn · YT' },
            ].map(({ ar, tag }) => (
              <button
                key={ar}
                onClick={() => setAspectRatios((cur) => cur.includes(ar) ? cur.filter((x) => x !== ar) : [...cur, ar])}
                className={`px-3 py-2 rounded-lg text-left border ${
                  aspectRatios.includes(ar) ? 'bg-teal-600/20 border-teal-500' : 'bg-gray-900 border-gray-700'
                }`}
              >
                <div className="text-sm font-medium">{ar}</div>
                <div className="text-xs text-gray-500">{tag}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* 6 · Caption style — visual previews so users see exactly what they're picking */}
        <Section title="6 · Caption style">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CAPTION_STYLES.map((s) => (
              <button
                key={s.key}
                onClick={() => setCaptionStyle(s.key)}
                className={`rounded-lg border text-left transition-colors overflow-hidden ${
                  captionStyle === s.key ? 'bg-teal-600/20 border-teal-500' : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                }`}
              >
                {/* Mock video frame with the actual caption style rendered on it */}
                <div
                  className="relative h-20 flex items-center justify-center overflow-hidden"
                  style={{
                    background:
                      'linear-gradient(135deg, #1e293b 0%, #334155 40%, #475569 70%, #64748b 100%)',
                  }}
                >
                  {s.renderPreview()}
                </div>
                <div className="p-2">
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-gray-400 leading-tight">{s.preview}</div>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* 7 · Polish — optional layering (formerly auto-applied). Default OFF
            because creators want their own footage to lead; auto B-roll/music
            often felt like filler. Turn on per-project when you want extra. */}
        <Section title="7 · Polish (optional)">
          <div className="space-y-2">
            <ToggleRow
              label="Add B-roll"
              sublabel="Cuts in stock clips that match your vibe + transcript. Off = your footage only."
              checked={enableBroll}
              onChange={setEnableBroll}
            />
            <ToggleRow
              label="Add background music"
              sublabel="Layers a vibe-matched track under your audio. Off = clean voice only."
              checked={enableMusic}
              onChange={setEnableMusic}
            />
          </div>
        </Section>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-950/40 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Create button */}
        <div className="sticky bottom-4 mt-2">
          <button
            onClick={createJob}
            disabled={creating || (sources.filter((s) => s.done).length === 0 && !linkValue)}
            className="w-full py-4 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold text-lg flex items-center justify-center gap-2 shadow-lg"
          >
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
            {mode === 'post'
              ? `Polish my post — ${creditCost} credit${creditCost === 1 ? '' : 's'}`
              : `Cut ${clipCount} clip${clipCount === 1 ? '' : 's'} — ${creditCost} credit${creditCost === 1 ? '' : 's'}`}
          </button>
          <div className="text-center text-xs text-gray-500 mt-2">
            {mode === 'post'
              ? `${aspectRatios.length} platform${aspectRatios.length === 1 ? '' : 's'} · 1 polished clip each · sources auto-delete after rendering`
              : `${clipCount} clip${clipCount === 1 ? '' : 's'} × ${aspectRatios.length} aspect${aspectRatios.length === 1 ? '' : 's'} · sources auto-delete after rendering`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{title}</h2>
      {children}
    </div>
  );
}

function ToggleRow({
  label, sublabel, checked, onChange,
}: { label: string; sublabel: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
        checked ? 'bg-teal-600/15 border-teal-500' : 'bg-gray-900 border-gray-700 hover:border-gray-500'
      }`}
    >
      <div className={`mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${checked ? 'bg-teal-500 justify-end' : 'bg-gray-700 justify-start'}`}>
        <div className="w-5 h-5 bg-white rounded-full shadow" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-400 leading-snug">{sublabel}</div>
      </div>
    </button>
  );
}

function EntryTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-3 rounded-lg border transition-colors ${
        active ? 'bg-teal-600/20 border-teal-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function DescribeBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<unknown>(null);

  const startVoice = useCallback(() => {
    type SpeechRecognitionEventLike = { results: { length: number; [k: number]: { [k: number]: { transcript: string } } } };
    interface SpeechRecognitionLike { continuous: boolean; interimResults: boolean; lang: string; onresult: (e: SpeechRecognitionEventLike) => void; onend: () => void; start: () => void; stop: () => void }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (e) => {
      let final = '';
      for (let i = 0; i < e.results.length; i++) {
        final += e.results[i][0].transcript;
      }
      onChange(final);
    };
    r.onend = () => setListening(false);
    r.start();
    recognitionRef.current = r;
    setListening(true);
  }, [onChange]);

  const stopVoice = useCallback(() => {
    type Stoppable = { stop: () => void };
    (recognitionRef.current as Stoppable | null)?.stop?.();
    setListening(false);
  }, []);

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Tell us what to make — or talk to it.'}
        rows={3}
        className="w-full px-4 py-3 pr-14 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500 resize-none text-sm"
      />
      <button
        onClick={listening ? stopVoice : startVoice}
        className={`absolute right-3 bottom-3 p-2 rounded-full ${listening ? 'bg-red-600 animate-pulse' : 'bg-teal-600 hover:bg-teal-500'}`}
        title={listening ? 'Tap to stop' : 'Talk it'}
      >
        <Mic className="w-4 h-4" />
      </button>
    </div>
  );
}

interface JobStatus {
  ok: boolean;
  id?: string;
  status?: string;
  progress_pct?: number;
  clips?: Array<{ id: string; output_url: string | null; hook_score: number | null; duration_sec: number | null; feel_diagnosis?: string | null }>;
  error_message?: string | null;
}

// ──────────────────────────────────────────────────────────────────────
// Cooking page — shown while the job runs and after it completes.
// ──────────────────────────────────────────────────────────────────────

/**
 * Pipeline stages in order, with friendly copy. Map ve_runs.status → index.
 *
 * IMPORTANT: keep this copy vibe-forward, NOT architecture-revealing. Earlier
 * iterations of these labels read like a technical README (transcription →
 * hook scoring → caption sync → composition) which let anyone watching their
 * upload reverse-engineer the pipeline. Talk about the OUTCOME, not the
 * recipe. Same principle applies to STATUS_COPY below.
 */
const STAGES: { key: string; label: string; sub: string }[] = [
  { key: 'transcribing', label: 'Tuning in',        sub: 'Soaking up your video' },
  { key: 'analyzing',    label: 'Reading the heat', sub: 'Finding what will pop' },
  { key: 'assembling',   label: 'Polishing',        sub: 'Getting it studio-ready' },
  { key: 'rendering',    label: 'Final cut',        sub: 'Wrapping up' },
];

/** "What's happening?" copy by status. Shown above the stage tracker.
 *  Same don't-leak-the-pipeline rule as STAGES above. */
const STATUS_COPY: Record<string, { title: string; sub: string }> = {
  created:      { title: 'Queued up',        sub: 'Right behind the projects ahead of you. Usually a few seconds.' },
  transcribing: { title: 'Tuning in',        sub: 'Getting a feel for your video.' },
  analyzing:    { title: 'Reading the heat', sub: 'Hunting the moments people will rewatch and reshare.' },
  assembling:   { title: 'Polishing',        sub: 'Adding the layer that makes it sound like a real creator.' },
  rendering:    { title: 'Final cut',        sub: 'Almost there — bringing it home.' },
};

function JobProgress({ mode, jobId, onNewJob }: { mode: Mode; jobId: string; onNewJob: () => void }) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);

  // Elapsed timer (lets us show an honest "running for 47s" instead of fake ETAs)
  useEffect(() => {
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Near-real-time status polling.
  //
  // Adaptive interval: poll fast during the engaged early window (where the
  // visitor is actively staring at the screen), then back off so we don't
  // hammer the API on long render queues.
  //   0-60s:    every 1s   (feels real-time during transcribe/analyze)
  //   60-300s:  every 2s
  //   300s+:    every 5s
  // Plus: immediate refresh when the tab regains focus, so people who tabbed
  // away to TikTok don't come back to a stale screen.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = Date.now();

    const nextDelay = () => {
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed < 60) return 1000;
      if (elapsed < 300) return 2000;
      return 5000;
    };

    const poll = async () => {
      if (!active) return;
      try {
        const r = await fetch(`/api/create/jobs/${jobId}`, { cache: 'no-store' });
        const j = (await r.json()) as JobStatus;
        if (!active) return;
        setJob(j);
        if (j.status && !['complete', 'failed'].includes(j.status)) {
          timer = setTimeout(poll, nextDelay());
        }
      } catch {
        if (active) timer = setTimeout(poll, 5000);
      }
    };

    // Refresh immediately on tab focus.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && active) {
        if (timer) clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [jobId]);

  const status = job?.status ?? 'created';
  const pct = job?.progress_pct ?? 5;
  const isDone = status === 'complete';
  const isFailed = status === 'failed';
  const copy = STATUS_COPY[status] || STATUS_COPY.created;
  const currentStageIdx = STAGES.findIndex((s) => s.key === status);
  const stagesDone = currentStageIdx === -1 ? (isDone ? STAGES.length : 0) : currentStageIdx;
  const mmss = `${Math.floor(elapsedSec / 60)}:${(elapsedSec % 60).toString().padStart(2, '0')}`;

  const copyClipLink = async (clipId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedClipId(clipId);
      setTimeout(() => setCopiedClipId((c) => (c === clipId ? null : c)), 2000);
    } catch { /* clipboard blocked, no-op */ }
  };

  const shareClip = async (clipId: string, url: string) => {
    // Use native share on phones; fall back to copy.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (d: { url: string; title?: string }) => Promise<void> })
          .share({ url, title: 'My FlashFlow clip' });
        return;
      } catch { /* user cancelled or unsupported */ }
    }
    void copyClipLink(clipId, url);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold">
              {isDone ? '✓ Your clips are ready' : isFailed ? 'Something broke' : copy.title}
            </h1>
            {!isDone && !isFailed && (
              <div className="text-xs text-gray-500 font-mono tabular-nums">{mmss}</div>
            )}
          </div>
          {!isFailed && (
            <p className="text-sm text-gray-400 leading-snug">
              {isDone
                ? `${job?.clips?.length ?? 0} ready · play, download, share — or queue another while these were good.`
                : copy.sub}
            </p>
          )}
        </div>

        {/* Failure banner */}
        {isFailed && (
          <div className="mb-6 bg-red-950/40 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-200">
            <div className="font-medium mb-1">We hit a snag rendering this one.</div>
            <div className="text-red-300/80 text-xs">{job?.error_message || 'Unknown error. Try again or contact support if it keeps happening.'}</div>
            <button
              onClick={onNewJob}
              className="mt-3 px-3 py-1.5 bg-red-700/40 hover:bg-red-700/60 rounded-md text-xs font-medium"
            >
              Start over
            </button>
          </div>
        )}

        {/* Stage tracker — hide once done */}
        {!isDone && !isFailed && (
          <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-teal-500 transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <div className="space-y-2">
              {STAGES.map((stage, idx) => {
                const done = idx < stagesDone;
                const active = idx === stagesDone || (idx === currentStageIdx);
                return (
                  <div
                    key={stage.key}
                    className={`flex items-start gap-3 text-sm transition-opacity ${active ? 'opacity-100' : done ? 'opacity-100' : 'opacity-40'}`}
                  >
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      done ? 'bg-teal-500 text-gray-950' :
                      active ? 'bg-teal-600/30 border border-teal-500 text-teal-300' :
                      'bg-gray-800 border border-gray-700 text-gray-500'
                    }`}>
                      {done ? '✓' : active ? <Loader2 className="w-3 h-3 animate-spin" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className={`font-medium ${active ? 'text-white' : 'text-gray-300'}`}>{stage.label}</div>
                      <div className="text-xs text-gray-500">{stage.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-800 text-xs text-gray-500">
              Typical render: 1–3 min for short videos, up to 5 min for long sources. Safe to navigate away — your videos will be in <Link href="/clips" className="text-teal-400 underline">My Videos</Link>.
            </div>
          </div>
        )}

        {/* Clips list */}
        {job?.clips && job.clips.length > 0 && (
          <div className="space-y-4">
            {job.clips.map((c, idx) => (
              <div key={c.id} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="font-semibold truncate">
                    {mode === 'clip' ? 'Clip' : 'Video'} {idx + 1}
                    {c.duration_sec ? <span className="text-gray-500 font-normal"> · {c.duration_sec.toFixed(0)}s</span> : null}
                  </div>
                  {c.hook_score != null && (
                    <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-full ${c.hook_score >= 7 ? 'bg-green-700/30 text-green-300' : c.hook_score >= 4 ? 'bg-yellow-700/30 text-yellow-300' : 'bg-gray-700 text-gray-300'}`}>
                      Feel {c.hook_score.toFixed(1)}/10
                    </span>
                  )}
                </div>
                {c.output_url ? (
                  <video
                    src={c.output_url}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full aspect-[9/16] bg-black rounded-lg"
                  />
                ) : (
                  <div className="aspect-[9/16] bg-gray-800 rounded-lg flex flex-col items-center justify-center text-gray-500 text-sm gap-2">
                    <Loader2 className="w-6 h-6 animate-spin opacity-50" />
                    <span>Rendering this {mode === 'clip' ? 'clip' : 'video'}…</span>
                  </div>
                )}
                {c.feel_diagnosis && (
                  <div className="text-xs text-gray-400 mt-2 italic leading-snug">{c.feel_diagnosis}</div>
                )}
                {c.output_url && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <a
                      href={c.output_url}
                      download
                      className="py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs sm:text-sm font-medium text-center"
                    >
                      Download
                    </a>
                    <button
                      onClick={() => copyClipLink(c.id, c.output_url!)}
                      className="py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs sm:text-sm font-medium"
                    >
                      {copiedClipId === c.id ? '✓ Copied' : 'Copy link'}
                    </button>
                    <button
                      onClick={() => shareClip(c.id, c.output_url!)}
                      className="py-2 bg-teal-600 hover:bg-teal-500 rounded-lg text-xs sm:text-sm font-medium"
                    >
                      Share
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Sticky footer actions */}
        <div className="mt-8 flex gap-2">
          <button
            onClick={onNewJob}
            className="flex-1 py-3 bg-teal-500 hover:bg-teal-600 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Make another
          </button>
          <Link href="/clips" className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium text-center">
            My Clips
          </Link>
        </div>

        {/* Tiny help line — only show during processing */}
        {!isDone && !isFailed && (
          <div className="mt-4 text-center text-xs text-gray-600">
            Bug or stuck? <Link href="/support" className="underline hover:text-gray-400">Tell us</Link> — we read everything.
          </div>
        )}
      </div>
    </div>
  );
}
