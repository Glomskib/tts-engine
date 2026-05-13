'use client';

/**
 * /create — the canonical AI clip tool.
 *
 * One page. Four entry methods (Record / Upload / Link / Drive). One describe
 * prompt with mic. One Vibe pick. One Brand pick. One Caption-style pick. One
 * "Create" button. Then the queue + clips.
 *
 * Replaces the 5 legacy editor pages (admin/editor, admin/clipper, admin/studio,
 * admin/video-editing, admin/content-studio). Those now 301 to /create.
 *
 * Phase 0: signed-URL upload to Supabase Storage (no 50MB API cap).
 * Phase 1: this shell + job creation hitting the existing ve_runs pipeline.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Upload, Link as LinkIcon, Video, Loader2, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Entry = 'record' | 'upload' | 'link' | 'drive';
type Vibe = 'hype' | 'calm' | 'real' | 'funny' | 'sad' | 'custom';

const VIBES: { key: Vibe; label: string; emoji: string; hint: string }[] = [
  { key: 'hype',   label: 'Hype',   emoji: '⚡', hint: 'High energy, fast cuts, big captions' },
  { key: 'calm',   label: 'Calm',   emoji: '🌿', hint: 'Slow pacing, soft captions, breathing room' },
  { key: 'real',   label: 'Real',   emoji: '🎙️', hint: 'Plain talk, no hype, friend-to-friend' },
  { key: 'funny',  label: 'Funny',  emoji: '😂', hint: 'Punchy beats, comedic timing on cuts' },
  { key: 'sad',    label: 'Sad',    emoji: '💔', hint: 'Heavy moments, minor key, lingering shots' },
];

const CAPTION_STYLES: { key: string; label: string; preview: string }[] = [
  { key: 'bold_yellow',   label: 'Bold Yellow',     preview: 'Big yellow MrBeast-style' },
  { key: 'subtle_white',  label: 'Subtle White',    preview: 'Clean white, no fuss' },
  { key: 'mr_beast',      label: 'MrBeast Big',     preview: 'Huge bold + outline' },
  { key: 'karaoke',       label: 'Karaoke',         preview: 'Word-by-word highlight' },
  { key: 'newscast',      label: 'Two-Line News',   preview: 'Bottom 2-line styled' },
  { key: 'slow_reader',   label: 'Slow Reader',     preview: 'Bigger text, slower pace' },
];

interface BrandProfile {
  id: string;
  name: string;
  tone_descriptor: string | null;
}

interface CreditState {
  remaining: number;
  isUnlimited: boolean;
  plan: string;
}

export default function CreatePage() {
  const [entry, setEntry] = useState<Entry>('upload');
  const [describe, setDescribe] = useState('');
  const [vibe, setVibe] = useState<Vibe>('real');
  const [customVibe, setCustomVibe] = useState('');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [captionStyle, setCaptionStyle] = useState<string>('bold_yellow');
  const [clipCount, setClipCount] = useState(3);
  const [aspectRatios, setAspectRatios] = useState<string[]>(['9:16']);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [sourceStoragePath, setSourceStoragePath] = useState<string | null>(null);
  const [sourceBackend, setSourceBackend] = useState<string | null>(null);
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

  // ── Load credits + brand profiles ──────────────────────────────────────
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
  const creditCost = (() => {
    // 1 credit per clip × number of aspect ratios. Re-renders cheaper handled server-side.
    return clipCount * aspectRatios.length;
  })();

  // ── Upload via signed URL (Phase 0 — bypasses 50MB API cap) ────────────
  const handleFileUpload = useCallback(async (file: File) => {
    setError(null);
    setUploadProgress(0);
    try {
      // 1. Ask server for a signed upload URL (server checks auth + reserves a storage path)
      const reqResp = await fetch('/api/create/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime: file.type, size: file.size }),
      });
      const reqJson = await reqResp.json();
      if (!reqResp.ok || !reqJson.ok) {
        setError(reqJson.error || 'Could not start upload. Are you on a plan that includes uploads?');
        setUploadProgress(null);
        return;
      }

      // 2. PUT the file directly to Supabase Storage. Bypasses our Next.js API
      //    body size limit (50MB). Storage tier caps the actual max file size.
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', reqJson.signed_url, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
      };
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve();
          // Parse Supabase's JSON error body for a useful message
          let detail = '';
          try {
            const body = JSON.parse(xhr.responseText || '{}');
            detail = body.message || body.error || '';
          } catch { detail = xhr.responseText?.slice(0, 200) || ''; }
          const sizeMb = (file.size / 1024 / 1024).toFixed(1);
          if (xhr.status === 413 || /too large|payload/i.test(detail)) {
            return reject(new Error(`Your video is ${sizeMb} MB — that's bigger than the storage tier allows right now. Try a shorter clip or compress it first. (paste a link to a YouTube/Vimeo/TikTok video instead if you have one)`));
          }
          if (xhr.status === 400) {
            return reject(new Error(`Storage rejected the upload (${sizeMb} MB ${file.type || 'unknown type'}). ${detail || 'No detail returned.'} Try a shorter clip or paste a link to the source video.`));
          }
          reject(new Error(`Upload failed: ${xhr.status} ${detail}`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload — check your connection.'));
        xhr.send(file);
      });

      setSourceUrl(reqJson.public_url);
      setSourceName(file.name);
      setSourceStoragePath(reqJson.storage_path || null);
      setSourceBackend(reqJson.backend || null);
      setUploadProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setUploadProgress(null);
    }
  }, []);

  // ── In-browser recording (Snapchat-style) ──────────────────────────────
  const startRecording = useCallback(async () => {
    setRecorderError(null);
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
        const filename = `recording-${Date.now()}.webm`;
        await handleFileUpload(new File([blob], filename, { type: mime }));
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      rec.start(1000); // collect data each second
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      setRecorderError(e instanceof Error ? e.message : 'Could not access camera/mic');
    }
  }, [handleFileUpload]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  // ── Submit job ─────────────────────────────────────────────────────────
  const createJob = useCallback(async () => {
    setError(null);
    if (!sourceUrl && !linkValue) {
      setError('Add a source first — record, upload, or paste a link.');
      return;
    }
    if (!describe.trim() && vibe !== 'custom') {
      setError('Describe what you want or pick a vibe — anything is fine, just give me a hint.');
      return;
    }
    setCreating(true);
    try {
      const body = {
        source_url: sourceUrl,
        source_link: linkValue || null,
        storage_path: sourceStoragePath,
        backend: sourceBackend,
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
        setError(j.error || 'Could not start the job. Check credits or try again in a minute.');
      } else {
        setJobId(j.job_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Job create failed');
    } finally {
      setCreating(false);
    }
  }, [sourceUrl, sourceStoragePath, sourceBackend, linkValue, describe, vibe, customVibe, brandId, captionStyle, clipCount, aspectRatios]);

  // ── UI ────────────────────────────────────────────────────────────────
  if (jobId) {
    return <JobProgress jobId={jobId} onNewJob={() => { setJobId(null); setSourceUrl(null); setSourceName(null); setSourceStoragePath(null); setSourceBackend(null); setLinkValue(''); setUploadProgress(null); }} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2">
              <Sparkles className="w-7 h-7 text-teal-400" />
              Create
            </h1>
            <p className="text-sm text-gray-400 mt-1">Record, upload, or paste a link. Tell us the vibe. We make the clips.</p>
          </div>
          {credits && (
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase tracking-wider">Credits</div>
              <div className="text-lg font-semibold">
                {credits.isUnlimited ? '∞' : credits.remaining}
              </div>
              <div className="text-xs text-gray-500">{credits.plan}</div>
            </div>
          )}
        </div>

        {/* 1 · Source picker */}
        <Section title="1 · Source">
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
                  <Video className="w-5 h-5" /> Start recording
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
            <div>
              <label className="block w-full">
                <div className="border-2 border-dashed border-gray-700 hover:border-teal-500 rounded-lg p-8 text-center cursor-pointer transition-colors">
                  <Upload className="w-10 h-10 mx-auto text-gray-500 mb-2" />
                  <div className="text-sm font-medium">{sourceName || 'Drop video here or click to choose'}</div>
                  <div className="text-xs text-gray-500 mt-1">MP4, MOV, WEBM up to 2GB</div>
                </div>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && void handleFileUpload(e.target.files[0])}
                />
              </label>
              {uploadProgress !== null && (
                <div className="mt-3">
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{uploadProgress < 100 ? `Uploading ${uploadProgress}%` : '✓ Uploaded'}</div>
                </div>
              )}
            </div>
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
              <div className="font-medium mb-2">Drive folder watcher (coming v1.1)</div>
              <p className="text-xs text-gray-500">
                Share a Google Drive folder with the FlashFlow service account once, and every new video you drop in gets auto-clipped and dropped back into a paired output folder. Set up arriving next ship.
              </p>
            </div>
          )}
        </Section>

        {/* 2 · Describe */}
        <Section title="2 · Describe">
          <DescribeBox value={describe} onChange={setDescribe} />
        </Section>

        {/* 3 · Vibe */}
        <Section title="3 · Vibe">
          <div className="flex flex-wrap gap-2">
            {VIBES.map((v) => (
              <button
                key={v.key}
                onClick={() => setVibe(v.key)}
                className={`px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
                  vibe === v.key ? 'bg-teal-600 border-teal-500 text-white' : 'bg-gray-900 border-gray-700 hover:border-gray-500'
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
              placeholder='Describe your own vibe — "cinematic Loro Piana ad" or "energetic gym bro"'
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

        {/* 5 · Captions */}
        <Section title="5 · Caption style">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CAPTION_STYLES.map((s) => (
              <button
                key={s.key}
                onClick={() => setCaptionStyle(s.key)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  captionStyle === s.key ? 'bg-teal-600/20 border-teal-500' : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                }`}
              >
                <div className="text-sm font-medium">{s.label}</div>
                <div className="text-xs text-gray-400 mt-1">{s.preview}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* 6 · Output */}
        <Section title="6 · Output">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">How many clips?</label>
              <input
                type="number"
                min={1}
                max={8}
                value={clipCount}
                onChange={(e) => setClipCount(Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))}
                className="mt-1 w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">Aspect ratios</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {['9:16', '1:1', '4:5', '16:9'].map((ar) => (
                  <button
                    key={ar}
                    onClick={() => setAspectRatios((cur) => cur.includes(ar) ? cur.filter((x) => x !== ar) : [...cur, ar])}
                    className={`px-2 py-1 rounded text-xs font-medium border ${
                      aspectRatios.includes(ar) ? 'bg-teal-600 border-teal-500' : 'bg-gray-900 border-gray-700'
                    }`}
                  >{ar}</button>
                ))}
              </div>
            </div>
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
        <div className="sticky bottom-4">
          <button
            onClick={createJob}
            disabled={creating || (!sourceUrl && !linkValue)}
            className="w-full py-4 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold text-lg flex items-center justify-center gap-2 shadow-lg"
          >
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            Create — {creditCost} credit{creditCost === 1 ? '' : 's'}
          </button>
          <div className="text-center text-xs text-gray-500 mt-2">
            {clipCount} clip{clipCount === 1 ? '' : 's'} × {aspectRatios.length} aspect{aspectRatios.length === 1 ? '' : 's'} · re-renders cost less
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

function DescribeBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
        placeholder='Tell us what to make — "3 hype clips with hooks that land in 2 seconds" — or just talk to it.'
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
