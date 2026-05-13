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
import {
  Mic, Upload, Link as LinkIcon, Video, Loader2, AlertTriangle, Sparkles,
  X, ChevronRight,
} from 'lucide-react';

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

interface BrandProfile { id: string; name: string; tone_descriptor: string | null }
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
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [credits, setCredits] = useState<CreditState | null>(null);
  const [recording, setRecording] = useState(false);
  const [recorderError, setRecorderError] = useState<string | null>(null);

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
        const [c, b] = await Promise.all([
          fetch('/api/credits/balance', { cache: 'no-store' }).then((r) => r.json()),
          fetch('/api/create/brand-profiles', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        if (c?.ok) setCredits({ remaining: c.remaining, isUnlimited: c.isUnlimited, plan: c.plan });
        if (b?.ok) setBrands(b.profiles || []);
      } catch (e) {
        console.warn('Create page init load failed', e);
      }
    })();
  }, []);

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
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const filename = `take-${sources.filter((s) => s.done).length + 1}-${Date.now()}.webm`;
        await uploadOneFile(new File([blob], filename, { type: mime }));
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      rec.start(1000);
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      setRecorderError(e instanceof Error ? e.message : 'Could not access camera/mic');
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
  }, [sources, linkValue, mode, describe, vibe, customVibe, brandId, captionStyle, clipCount, aspectRatios, defaults]);

  // ── UI ─────────────────────────────────────────────────────────────────
  if (jobId) {
    return <JobProgress jobId={jobId} onNewJob={() => { setJobId(null); setSources([]); setLinkValue(''); }} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
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
          {credits && (
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase tracking-wider">Credits</div>
              <div className="text-lg font-semibold">{credits.isUnlimited ? '∞' : credits.remaining}</div>
              <div className="text-xs text-gray-500">{credits.plan}</div>
            </div>
          )}
        </div>

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
          <div className="grid grid-cols-4 gap-2 mb-4">
            <EntryTab active={entry === 'record'} onClick={() => setEntry('record')} icon={<Video className="w-4 h-4" />} label="Record" />
            <EntryTab active={entry === 'upload'} onClick={() => setEntry('upload')} icon={<Upload className="w-4 h-4" />} label="Upload" />
            <EntryTab active={entry === 'link'}   onClick={() => setEntry('link')}   icon={<LinkIcon className="w-4 h-4" />} label="Link" />
            <EntryTab active={entry === 'drive'}  onClick={() => setEntry('drive')}  icon={<Sparkles className="w-4 h-4" />} label="Drive" />
          </div>

          {entry === 'record' && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <video ref={videoPreviewRef} className="w-full aspect-[9/16] bg-black rounded mb-3" muted playsInline />
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
              <p className="text-xs text-gray-500">Share a folder once, every new video auto-clips.</p>
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
          {brands.length === 0 ? (
            <div className="text-sm text-gray-400 bg-gray-900 border border-gray-700 rounded-lg p-3">
              No brand profiles yet — using your account default. <a href="/admin/brand-profiles" className="text-teal-400 underline">Create one →</a>
            </div>
          ) : (
            <select
              value={brandId || ''}
              onChange={(e) => setBrandId(e.target.value || null)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500"
            >
              <option value="">Default (account voice)</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
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

function JobProgress({ jobId, onNewJob }: { jobId: string; onNewJob: () => void }) {
  const [job, setJob] = useState<JobStatus | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/create/jobs/${jobId}`, { cache: 'no-store' });
        const j = (await r.json()) as JobStatus;
        if (active) setJob(j);
        if (active && j.status && !['complete', 'failed'].includes(j.status)) {
          setTimeout(poll, 2500);
        }
      } catch {
        if (active) setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => { active = false; };
  }, [jobId]);

  const pct = job?.progress_pct ?? 0;
  const status = job?.status ?? 'queued';
  const isDone = status === 'complete';
  const isFailed = status === 'failed';

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-3xl font-bold mb-6">
          {isDone ? '✓ Done' : isFailed ? 'Something broke' : 'Cooking…'}
        </h1>

        {!isDone && !isFailed && (
          <div className="mb-6">
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-teal-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-sm text-gray-400 capitalize">{status.replace(/_/g, ' ')} · {pct}%</div>
          </div>
        )}

        {isFailed && job?.error_message && (
          <div className="mb-6 bg-red-950/40 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-200">
            {job.error_message}
          </div>
        )}

        {job?.clips && job.clips.length > 0 && (
          <div className="space-y-4">
            {job.clips.map((c, idx) => (
              <div key={c.id} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">Clip {idx + 1}{c.duration_sec ? ` · ${c.duration_sec.toFixed(0)}s` : ''}</div>
                  {c.hook_score != null && (
                    <span className={`text-xs px-2 py-1 rounded-full ${c.hook_score >= 7 ? 'bg-green-700/30 text-green-300' : c.hook_score >= 4 ? 'bg-yellow-700/30 text-yellow-300' : 'bg-gray-700 text-gray-300'}`}>
                      Feel {c.hook_score.toFixed(1)}/10
                    </span>
                  )}
                </div>
                {c.output_url ? (
                  <video src={c.output_url} controls className="w-full aspect-[9/16] bg-black rounded-lg" />
                ) : (
                  <div className="aspect-[9/16] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                    Rendering…
                  </div>
                )}
                {c.feel_diagnosis && (
                  <div className="text-xs text-gray-400 mt-2 italic">{c.feel_diagnosis}</div>
                )}
                {c.output_url && (
                  <div className="flex gap-2 mt-3">
                    <a href={c.output_url} download className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium text-center">Download</a>
                    <button className="flex-1 py-2 bg-teal-600 hover:bg-teal-500 rounded-lg text-sm font-medium">Publish</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex gap-2">
          <button
            onClick={onNewJob}
            className="flex-1 py-3 bg-teal-500 hover:bg-teal-600 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Make another
          </button>
          <a href="/clips" className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium text-center">
            My Clips
          </a>
        </div>
      </div>
    </div>
  );
}
