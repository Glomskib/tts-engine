'use client';

/**
 * /studio — phone-first record-stop-record loop.
 *
 * What this is and isn't:
 *   - IS a creator-grade capture surface: fullscreen camera, big record button,
 *     wireless-mic picker with live VU, sticky edit prefs, inline queue strip.
 *   - IS NOT a new pipeline. Every clip is POSTed straight to the existing
 *     /api/create/jobs (same backend /create uses). Closing the tab does not
 *     stop processing — the pipeline runs server-side regardless.
 *
 * Field shapes match /api/create/jobs and /api/create/upload-url 1:1 so we
 * inherit credits, rate limits, and the existing render fleet for free.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Mic, MicOff, Settings, X, Check, AlertTriangle, Loader2, SwitchCamera,
  ChevronUp, ChevronDown, Bluetooth, Volume2, RefreshCw, Trash2, Play,
} from 'lucide-react';
import PWAInstaller from '@/components/pwa/PWAInstaller';

type Vibe = 'hype' | 'calm' | 'real' | 'funny' | 'sad';
type ClipStatus = 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';

interface Clip {
  local_id: string;       // client-only id so the UI tracks before server replies
  run_id?: string;        // ve_runs.id once /api/create/jobs returns job_id
  status: ClipStatus;
  progress: number;       // 0..100 for upload, then 0..100 (best-effort) for processing
  blob_url?: string;
  storage_path?: string;
  duration_sec?: number;
  final_url?: string;
  thumb_url?: string;
  error?: string;
  created_at: number;
}

interface MicDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput';
  isBluetooth: boolean;
  isWireless: boolean;
}

const VIBES: { key: Vibe; emoji: string; label: string }[] = [
  { key: 'hype', emoji: '⚡', label: 'Hype' },
  { key: 'calm', emoji: '🌿', label: 'Calm' },
  { key: 'real', emoji: '🎙️', label: 'Real' },
  { key: 'funny', emoji: '😂', label: 'Funny' },
  { key: 'sad', emoji: '💔', label: 'Sad' },
];

const CAPTION_STYLES = [
  { key: 'karaoke', label: 'Karaoke' },
  { key: 'bold_yellow', label: 'Bold Yellow' },
  { key: 'subtle_white', label: 'Subtle White' },
  { key: 'mr_beast', label: 'MrBeast' },
  { key: 'newscast', label: 'Newscast' },
];

const PREF_KEY = 'studio.prefs.v1';

interface Prefs {
  vibe: Vibe;
  captionStyle: string;
  addBroll: boolean;
  addMusic: boolean;
  facingMode: 'user' | 'environment';
  micDeviceId: string | null;
  describe: string;
}

const DEFAULT_PREFS: Prefs = {
  vibe: 'real',
  captionStyle: 'karaoke',
  addBroll: false,
  addMusic: false,
  facingMode: 'user',
  micDeviceId: null,
  describe: '',
};

function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { return DEFAULT_PREFS; }
}

function savePrefs(p: Prefs) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
}

/** Heuristic: does this device label look like a Bluetooth or wireless mic? */
function classifyMic(label: string): { isBluetooth: boolean; isWireless: boolean } {
  const l = label.toLowerCase();
  const isBluetooth = /(bluetooth|airpods|beats|sony|bose|jabra|wh-|wf-)/i.test(l);
  const isWireless = /(dji mic|rode wireless|rode go|hollyland|saramonic|wireless go|comica|movo|sennheiser xs|røde)/i.test(l) || isBluetooth;
  return { isBluetooth, isWireless };
}

export default function StudioPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [showSettings, setShowSettings] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [permState, setPermState] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [mics, setMics] = useState<MicDevice[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setPrefs(loadPrefs()); }, []);
  useEffect(() => { savePrefs(prefs); }, [prefs]);

  const refreshMics = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const ins: MicDevice[] = all.filter(d => d.kind === 'audioinput').map(d => {
        const c = classifyMic(d.label || '');
        return {
          deviceId: d.deviceId,
          label: d.label || 'Microphone',
          kind: 'audioinput' as const,
          isBluetooth: c.isBluetooth,
          isWireless: c.isWireless,
        };
      });
      setMics(ins);
      setPrefs(p => {
        // Auto-pick a mic when nothing is saved or the saved one is gone:
        //   1. Wireless / lavalier (DJI Mic, Rode Wireless, AirPods…) first
        //   2. Otherwise the first audioinput (usually built-in)
        if (p.micDeviceId && ins.some(m => m.deviceId === p.micDeviceId)) return p;
        const wireless = ins.find(m => m.isWireless);
        const pick = wireless || ins[0];
        if (pick) return { ...p, micDeviceId: pick.deviceId };
        return p;
      });
    } catch (e) {
      console.error('enumerateDevices failed', e);
    }
  }, []);

  const stopMeter = useCallback(() => {
    if (meterRafRef.current) cancelAnimationFrame(meterRafRef.current);
    meterRafRef.current = null;
    analyserRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    setAudioLevel(0);
  }, []);

  const startCamera = useCallback(async () => {
    setPermState('requesting');
    setMediaError(null);
    try {
      const audioConstraints: MediaTrackConstraints = prefs.micDeviceId
        ? { deviceId: { exact: prefs.micDeviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: false }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: false };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: {
          facingMode: prefs.facingMode,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          frameRate: { ideal: 30 },
        },
      });

      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPermState('granted');
      await refreshMics();

      stopMeter();
      try {
        const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        analyserRef.current = analyser;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = Math.abs(buf[i] - 128) / 128;
            if (v > peak) peak = v;
          }
          setAudioLevel(peak);
          meterRafRef.current = requestAnimationFrame(tick);
        };
        meterRafRef.current = requestAnimationFrame(tick);
      } catch (e) { console.warn('VU meter setup failed', e); }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      setPermState('denied');
      if (e?.name === 'NotAllowedError') {
        setMediaError('Camera + mic permission denied. Tap the address bar → Site Settings → Allow.');
      } else if (e?.name === 'NotFoundError') {
        setMediaError('No camera or microphone found on this device.');
      } else {
        setMediaError(e?.message || 'Could not access camera.');
      }
    }
  }, [prefs.micDeviceId, prefs.facingMode, refreshMics, stopMeter]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      stopMeter();
      if (tickRef.current) clearInterval(tickRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (permState === 'granted') startCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.facingMode, prefs.micDeviceId]);

  const startRecording = useCallback(() => {
    if (!streamRef.current || recording) return;
    try {
      const mime = MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac')
        ? 'video/mp4;codecs=h264,aac'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm';
      const rec = new MediaRecorder(streamRef.current, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        const duration = (Date.now() - recStartRef.current) / 1000;
        const localId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const clip: Clip = {
          local_id: localId,
          status: 'uploading',
          progress: 0,
          blob_url: blobUrl,
          duration_sec: duration,
          created_at: Date.now(),
        };
        setClips(prev => [clip, ...prev]);
        uploadAndQueue(localId, blob, mime).catch(err => {
          console.error('uploadAndQueue failed', err);
          setClips(prev => prev.map(c => c.local_id === localId
            ? { ...c, status: 'failed', error: String(err?.message || err) } : c));
        });
      };
      recorderRef.current = rec;
      recStartRef.current = Date.now();
      setRecElapsed(0);
      tickRef.current = setInterval(() => {
        setRecElapsed(Math.floor((Date.now() - recStartRef.current) / 1000));
      }, 250);
      rec.start();
      setRecording(true);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMediaError(err?.message || 'Recording failed to start.');
    }
  }, [recording]);

  const stopRecording = useCallback(() => {
    if (!recording || !recorderRef.current) return;
    try { recorderRef.current.stop(); } catch {}
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setRecording(false);
  }, [recording]);

  /**
   * Upload the recorded blob to storage, then POST a polish job. We follow
   * /api/create/upload-url's shape exactly: { filename, mime, size } in,
   * { signed_url, public_url, storage_path, backend } out.
   */
  async function uploadAndQueue(localId: string, blob: Blob, mime: string) {
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const filename = `studio-${Date.now()}.${ext}`;

    // Step 1: presigned URL
    const upRes = await fetch('/api/create/upload-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename, mime, size: blob.size }),
    });
    if (!upRes.ok) {
      const txt = await upRes.text().catch(() => '');
      throw new Error(`upload-url ${upRes.status}: ${txt.slice(0, 200)}`);
    }
    const up = await upRes.json() as {
      ok: boolean; signed_url?: string; public_url?: string; storage_path?: string; backend?: string; error?: string;
    };
    if (!up.ok || !up.signed_url || !up.public_url || !up.storage_path) {
      throw new Error(up.error || 'upload-url missing fields');
    }

    // Step 2: PUT to storage with progress
    await putWithProgress(up.signed_url, blob, mime, (pct) => {
      setClips(prev => prev.map(c => c.local_id === localId ? { ...c, progress: pct } : c));
    });

    setClips(prev => prev.map(c => c.local_id === localId
      ? { ...c, progress: 100, status: 'queued', storage_path: up.storage_path }
      : c));

    // Step 3: queue the polish job — same payload shape /create posts.
    // Studio is "Post Maker" mode (1 take in, 1 polished clip out).
    const jobRes = await fetch('/api/create/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'post',
        source_url: up.public_url,
        storage_path: up.storage_path,
        backend: up.backend || 'r2',
        describe: prefs.describe || '',
        vibe: prefs.vibe,
        caption_style: prefs.captionStyle,
        clip_count: 1,
        aspect_ratios: ['9:16'],
        additional_sources: [],
        enable_broll: prefs.addBroll,
        enable_music: prefs.addMusic,
      }),
    });
    if (!jobRes.ok) {
      const txt = await jobRes.text().catch(() => '');
      throw new Error(`create/jobs ${jobRes.status}: ${txt.slice(0, 200)}`);
    }
    const job = await jobRes.json() as { ok: boolean; job_id?: string; error?: string; code?: string };
    if (!job.ok || !job.job_id) {
      throw new Error(job.error || 'job create failed');
    }
    setClips(prev => prev.map(c => c.local_id === localId
      ? { ...c, run_id: job.job_id, status: 'processing' }
      : c));
  }

  function putWithProgress(url: string, blob: Blob, contentType: string, onPct: (n: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('content-type', contentType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`PUT ${xhr.status}`));
      xhr.onerror = () => reject(new Error('upload network error'));
      xhr.send(blob);
    });
  }

  /** Poll /api/create/jobs and update each tracked clip's status. */
  useEffect(() => {
    const has = clips.some(c => (c.status === 'processing' || c.status === 'queued') && c.run_id);
    if (!has) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch('/api/create/jobs', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json() as { ok: boolean; jobs?: { id: string; status: string; context_json?: { progress?: number; final_url?: string; thumb_url?: string }; error_message?: string }[]; rows?: typeof j.jobs; data?: typeof j.jobs };
        const rows = j.jobs || j.rows || j.data || [];
        setClips(prev => prev.map(p => {
          if (!p.run_id) return p;
          const row = rows.find(r => r.id === p.run_id);
          if (!row) return p;
          const ctx = row.context_json || {};
          const progress = typeof ctx.progress === 'number' ? ctx.progress : p.progress;
          const finalUrl = ctx.final_url;
          const thumbUrl = ctx.thumb_url;
          if (['done', 'ready', 'completed'].includes(row.status)) {
            return { ...p, status: 'ready', progress: 100, final_url: finalUrl, thumb_url: thumbUrl };
          }
          if (['failed', 'error'].includes(row.status)) {
            return { ...p, status: 'failed', error: row.error_message };
          }
          return { ...p, progress: Math.max(p.progress, progress) };
        }));
      } catch {}
    }, 4000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips.map(c => `${c.local_id}:${c.status}:${c.run_id || ''}`).join('|')]);

  const pendingCount = clips.filter(c => c.status !== 'ready' && c.status !== 'failed').length;
  const selectedMic = mics.find(m => m.deviceId === prefs.micDeviceId);

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      <PWAInstaller />

      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: prefs.facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
      />

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 p-3 flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <Link href="/" className="px-3 py-1.5 rounded-full bg-black/40 backdrop-blur text-xs font-medium border border-white/10">
          ← FlashFlow
        </Link>
        <div className="flex items-center gap-2">
          <MicBadge mic={selectedMic} level={audioLevel} />
          <button onClick={() => setShowSettings(true)} className="p-2 rounded-full bg-black/40 backdrop-blur border border-white/10" aria-label="Settings">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {recording && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full bg-red-600 text-white font-bold text-sm flex items-center gap-2 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          REC {fmtElapsed(recElapsed)}
        </div>
      )}

      {mediaError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-5 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 mx-auto text-amber-400" />
            <div className="text-base font-semibold">Camera + mic needed</div>
            <div className="text-sm text-zinc-400">{mediaError}</div>
            <button onClick={startCamera} className="w-full py-2.5 rounded-lg bg-teal-500 hover:bg-teal-600 font-semibold">
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 inset-x-0 z-20 px-4 pb-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
        {clips.length > 0 && (
          <button
            onClick={() => setShowQueue(true)}
            className="w-full mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/50 backdrop-blur border border-white/10 text-left"
          >
            <div className="flex -space-x-2">
              {clips.slice(0, 4).map(c => (
                <div key={c.local_id} className="w-8 h-8 rounded-md bg-zinc-800 border border-black overflow-hidden">
                  {c.thumb_url ? (
                    <img src={c.thumb_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {c.status === 'ready' ? <Check className="w-4 h-4 text-emerald-400" />
                        : c.status === 'failed' ? <X className="w-4 h-4 text-red-400" />
                        : <Loader2 className="w-4 h-4 animate-spin text-teal-400" />}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">
                {pendingCount > 0 ? `${pendingCount} processing` : `${clips.length} ready`}
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                Tap to see queue · clips finish in the background
              </div>
            </div>
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          </button>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 flex justify-start">
            <VibePill vibe={prefs.vibe} onClick={() => setShowSettings(true)} />
          </div>
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={permState !== 'granted'}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
            className="relative w-20 h-20 rounded-full flex items-center justify-center disabled:opacity-40 transition-transform active:scale-95"
            style={{ background: recording ? '#dc2626' : 'white' }}
          >
            {recording ? (
              <div className="w-7 h-7 bg-white rounded-sm" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-red-600 ring-4 ring-white" />
            )}
          </button>
          <div className="flex-1 flex justify-end">
            <button
              onClick={() => setPrefs(p => ({ ...p, facingMode: p.facingMode === 'user' ? 'environment' : 'user' }))}
              className="p-3 rounded-full bg-black/40 backdrop-blur border border-white/10"
              aria-label="Flip camera"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="text-center text-[11px] text-zinc-400 mt-3">
          {recording ? 'Tap stop. Next take queues automatically.' : 'Record. Stop. Record again. Polish happens in the background.'}
        </div>
      </div>

      {showSettings && (
        <SettingsSheet
          prefs={prefs}
          setPrefs={setPrefs}
          mics={mics}
          refreshMics={refreshMics}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showQueue && (
        <QueueSheet clips={clips} onClose={() => setShowQueue(false)} onDiscard={(id) => setClips(prev => prev.filter(c => c.local_id !== id))} />
      )}
    </div>
  );
}

function fmtElapsed(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

function MicBadge({ mic, level }: { mic: MicDevice | undefined; level: number }) {
  if (!mic) return (
    <div className="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur border border-white/10 text-[11px] flex items-center gap-1.5">
      <MicOff className="w-3.5 h-3.5 text-zinc-400" /> no mic
    </div>
  );
  const Icon = mic.isBluetooth ? Bluetooth : mic.isWireless ? Volume2 : Mic;
  const tint = mic.isWireless ? 'text-teal-300' : 'text-white';
  return (
    <div className="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur border border-white/10 text-[11px] flex items-center gap-1.5">
      <Icon className={`w-3.5 h-3.5 ${tint}`} />
      <span className="max-w-[8rem] truncate">{mic.label.replace(/\(.*?\)/g, '').trim() || 'mic'}</span>
      <div className="w-8 h-1 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-teal-400" style={{ width: `${Math.min(100, level * 140)}%`, transition: 'width 80ms linear' }} />
      </div>
    </div>
  );
}

function VibePill({ vibe, onClick }: { vibe: Vibe; onClick: () => void }) {
  const v = VIBES.find(x => x.key === vibe)!;
  return (
    <button onClick={onClick} className="px-3 py-1.5 rounded-full bg-black/40 backdrop-blur border border-white/10 text-xs font-medium flex items-center gap-1.5">
      <span>{v.emoji}</span><span>{v.label}</span><ChevronDown className="w-3.5 h-3.5 opacity-60" />
    </button>
  );
}

function SettingsSheet({
  prefs, setPrefs, mics, refreshMics, onClose,
}: {
  prefs: Prefs; setPrefs: (fn: (p: Prefs) => Prefs) => void;
  mics: MicDevice[]; refreshMics: () => void; onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-zinc-950 border-t sm:border border-white/10 sm:rounded-2xl rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-base font-semibold">Studio settings</div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-5">
          <Section title="Mic">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-zinc-400">Pick your wireless mic, AirPods, or built-in.</div>
              <button onClick={refreshMics} className="text-[11px] flex items-center gap-1 text-teal-400"><RefreshCw className="w-3 h-3" />Refresh</button>
            </div>
            <div className="space-y-1.5">
              {mics.length === 0 && <div className="text-xs text-zinc-500">No mics found yet. Allow mic permission, then refresh.</div>}
              {mics.map(m => {
                const sel = prefs.micDeviceId === m.deviceId;
                const Icon = m.isBluetooth ? Bluetooth : m.isWireless ? Volume2 : Mic;
                return (
                  <button
                    key={m.deviceId}
                    onClick={() => setPrefs(p => ({ ...p, micDeviceId: m.deviceId }))}
                    className={`w-full px-3 py-2.5 rounded-lg border flex items-center gap-2.5 text-left ${sel ? 'bg-teal-600/20 border-teal-500' : 'bg-zinc-900 border-white/10'}`}
                  >
                    <Icon className={`w-4 h-4 ${m.isWireless ? 'text-teal-300' : 'text-zinc-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{m.label || 'Microphone'}</div>
                      <div className="text-[11px] text-zinc-500">
                        {m.isBluetooth ? 'Bluetooth' : m.isWireless ? 'Wireless / lavalier' : 'Built-in / USB'}
                      </div>
                    </div>
                    {sel && <Check className="w-4 h-4 text-teal-300" />}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Vibe">
            <div className="flex flex-wrap gap-2">
              {VIBES.map(v => {
                const sel = prefs.vibe === v.key;
                return (
                  <button
                    key={v.key}
                    onClick={() => setPrefs(p => ({ ...p, vibe: v.key }))}
                    className={`px-3 py-1.5 rounded-full text-sm border ${sel ? 'bg-teal-600 border-teal-500' : 'bg-zinc-900 border-white/10'}`}
                  >
                    {v.emoji} {v.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Caption style">
            <div className="grid grid-cols-2 gap-2">
              {CAPTION_STYLES.map(s => {
                const sel = prefs.captionStyle === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setPrefs(p => ({ ...p, captionStyle: s.key }))}
                    className={`px-3 py-2 rounded-lg text-sm border text-left ${sel ? 'bg-teal-600/20 border-teal-500' : 'bg-zinc-900 border-white/10'}`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Polish">
            <Toggle label="Add B-roll" hint="Stock clips that match your vibe + transcript." on={prefs.addBroll} onChange={(on) => setPrefs(p => ({ ...p, addBroll: on }))} />
            <Toggle label="Add background music" hint="Vibe-matched track under your audio." on={prefs.addMusic} onChange={(on) => setPrefs(p => ({ ...p, addMusic: on }))} />
          </Section>

          <Section title="Prompt (optional)">
            <textarea
              value={prefs.describe}
              onChange={(e) => setPrefs(p => ({ ...p, describe: e.target.value.slice(0, 1000) }))}
              placeholder="Anything I should know about this take? Topic, hook, target audience..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none resize-none"
            />
          </Section>
        </div>

        <button onClick={onClose} className="mt-5 w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-600 font-semibold">Done</button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="w-full flex items-start gap-3 p-2.5 rounded-lg border bg-zinc-900 border-white/10 text-left mb-1.5"
    >
      <div className={`mt-0.5 w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${on ? 'bg-teal-500 justify-end' : 'bg-zinc-700 justify-start'}`}>
        <div className="w-4 h-4 bg-white rounded-full shadow" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-zinc-400 leading-snug">{hint}</div>
      </div>
    </button>
  );
}

function QueueSheet({ clips, onClose, onDiscard }: { clips: Clip[]; onClose: () => void; onDiscard: (id: string) => void }) {
  return (
    <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-zinc-950 border-t sm:border border-white/10 sm:rounded-2xl rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-base font-semibold">Your clips</div>
            <div className="text-[11px] text-zinc-500">Newest first. Refreshes every 4s.</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-2">
          {clips.length === 0 && <div className="text-sm text-zinc-500 text-center py-8">No clips yet. Tap record to start.</div>}
          {clips.map(c => (
            <div key={c.local_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-900 border border-white/10">
              <div className="w-12 h-16 rounded-md bg-black overflow-hidden flex items-center justify-center flex-shrink-0">
                {c.thumb_url ? <img src={c.thumb_url} alt="" className="w-full h-full object-cover" />
                  : c.status === 'ready' ? <Check className="w-5 h-5 text-emerald-400" />
                  : c.status === 'failed' ? <AlertTriangle className="w-5 h-5 text-red-400" />
                  : <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {c.status === 'uploading' && `Uploading ${c.progress}%`}
                  {c.status === 'queued' && 'Queued'}
                  {c.status === 'processing' && `Polishing ${c.progress > 0 ? c.progress + '%' : '…'}`}
                  {c.status === 'ready' && 'Ready'}
                  {c.status === 'failed' && 'Failed'}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {c.duration_sec ? `${c.duration_sec.toFixed(1)}s · ` : ''}{new Date(c.created_at).toLocaleTimeString()}
                </div>
                {c.error && <div className="text-[11px] text-red-400 truncate">{c.error}</div>}
                {(c.status === 'uploading' || c.status === 'processing') && (
                  <div className="mt-1 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-400" style={{ width: `${c.progress}%`, transition: 'width 200ms linear' }} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {c.status === 'ready' && c.final_url && (
                  <a href={c.final_url} target="_blank" rel="noreferrer" className="p-2 rounded-md bg-teal-500/20 text-teal-300 hover:bg-teal-500/30">
                    <Play className="w-4 h-4" />
                  </a>
                )}
                {(c.status === 'uploading' || c.status === 'queued') && (
                  <button onClick={() => onDiscard(c.local_id)} className="p-2 rounded-md text-zinc-400 hover:bg-white/10" title="Discard">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <Link href="/studio/queue" className="mt-4 block w-full text-center py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm">
          Open full Queue →
        </Link>
      </div>
    </div>
  );
}
