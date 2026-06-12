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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Mic, MicOff, Settings, X, Check, AlertTriangle, Loader2, SwitchCamera,
  ChevronUp, ChevronDown, Bluetooth, Volume2, RefreshCw, Trash2, Play,
  Zap, ZapOff,
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

/**
 * zoom / torch are real on phone Chrome + iOS Safari but missing from TS's
 * MediaTrackCapabilities/ConstraintSet types — extend locally and
 * feature-detect at runtime so browsers without getCapabilities (Firefox)
 * never crash.
 */
interface ZoomRange { min: number; max: number; step?: number }
type CameraCapabilities = MediaTrackCapabilities & { zoom?: ZoomRange; torch?: boolean };
type CameraConstraintSet = MediaTrackConstraintSet & { zoom?: number; torch?: boolean };

// Canvas-crop fallback cap — past 3x a digital crop turns to mush.
const DIGITAL_ZOOM_MAX = 3;

interface LensPill {
  label: string;
  value: number;
  /** 'zoom' = constraint on the current track; 'ultrawide-device' = swap to the iOS ultra-wide videoinput. */
  kind: 'zoom' | 'ultrawide-device';
}

/** iOS Safari exposes the back ultra-wide as a SEPARATE videoinput, not zoom<1. */
function isUltraWideLabel(label: string): boolean {
  return /ultra[- ]?wide|0\.5/i.test(label) && !/front/i.test(label);
}

/** Distance between the first two touches — pinch gesture math. */
function touchDist(t: React.TouchList): number {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
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

  // --- Real-camera controls: zoom / lens / torch ---
  const [zoom, setZoom] = useState(1);
  const [zoomCaps, setZoomCaps] = useState<ZoomRange | null>(null);
  const [zoomHudVisible, setZoomHudVisible] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [ultraWideId, setUltraWideId] = useState<string | null>(null);
  const [usingUltraWide, setUsingUltraWide] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(true);

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

  // Zoom plumbing. Refs mirror state so MediaRecorder callbacks and the canvas
  // draw loop always see the live value without re-subscribing.
  const zoomRef = useRef(1);
  const zoomCapsRef = useRef<ZoomRange | null>(null);
  const pendingZoomRef = useRef<number | null>(null);   // zoom to apply right after a lens switch
  const videoDeviceIdRef = useRef<string | null>(null); // set = pin to a specific videoinput (iOS ultra-wide)
  const nativeZoomTargetRef = useRef<number | null>(null);
  const nativeZoomBusyRef = useRef(false);
  const zoomHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Digital-zoom recording pipeline (desktop / no caps.zoom): video → canvas crop → captureStream.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const canvasRafRef = useRef<number | null>(null);
  const canvasDrawingRef = useRef(false);
  // Pinch / double-tap gesture state.
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const pinchActiveRef = useRef(false);
  const lastTapRef = useRef(0);

  useEffect(() => { setPrefs(loadPrefs()); }, []);
  useEffect(() => { savePrefs(prefs); }, [prefs]);

  const refreshMics = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();

      // Cameras too (labels are only populated after permission, which is why
      // this runs from startCamera): flip button needs >1 videoinput, and iOS
      // lists the back ultra-wide as its own device — that IS the 0.5x lens.
      const cams = all.filter(d => d.kind === 'videoinput');
      setHasMultipleCameras(cams.length > 1);
      const uw = cams.find(d => isUltraWideLabel(d.label || ''));
      setUltraWideId(uw ? uw.deviceId : null);

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

  /** Flash the "1.7x" HUD, then fade it out after a moment of no interaction. */
  const bumpZoomHud = useCallback(() => {
    setZoomHudVisible(true);
    if (zoomHudTimerRef.current) clearTimeout(zoomHudTimerRef.current);
    zoomHudTimerRef.current = setTimeout(() => setZoomHudVisible(false), 1500);
  }, []);

  /**
   * Native zoom with backpressure: pinch fires ~60 events/sec but some Android
   * camera HALs choke on queued applyConstraints. Keep at most one in flight;
   * latecomers just overwrite the target and get applied when it settles.
   */
  const applyNativeZoom = useCallback((value: number) => {
    nativeZoomTargetRef.current = value;
    if (nativeZoomBusyRef.current) return;
    const run = () => {
      const track = streamRef.current?.getVideoTracks()[0];
      const target = nativeZoomTargetRef.current;
      nativeZoomTargetRef.current = null;
      if (!track || target == null) { nativeZoomBusyRef.current = false; return; }
      nativeZoomBusyRef.current = true;
      track.applyConstraints({ advanced: [{ zoom: target } as CameraConstraintSet] })
        .catch(() => {}) // unsupported value mid-range: ignore, preview just stays put
        .finally(() => {
          nativeZoomBusyRef.current = false;
          if (nativeZoomTargetRef.current != null) run();
        });
    };
    run();
  }, []);

  /**
   * THE zoom entry point (pills, pinch, slider, double-tap all land here).
   * Native path bakes into the recording via the camera driver; digital path
   * is read live by the canvas draw loop, so both are WYSIWYG and both are
   * safe to change while recording.
   */
  const setZoomLevel = useCallback((target: number) => {
    const caps = zoomCapsRef.current;
    let next: number;
    if (caps) {
      next = Math.min(caps.max, Math.max(caps.min, target));
      applyNativeZoom(next);
    } else {
      // Digital fallback can only crop in (no 0.5x) and quality-caps at 3x.
      next = Math.min(DIGITAL_ZOOM_MAX, Math.max(1, target));
    }
    next = Math.round(next * 100) / 100;
    zoomRef.current = next;
    setZoom(next);
    bumpZoomHud();
  }, [applyNativeZoom, bumpZoomHud]);

  const stopCanvasPipeline = useCallback(() => {
    canvasDrawingRef.current = false;
    if (canvasRafRef.current) cancelAnimationFrame(canvasRafRef.current);
    canvasRafRef.current = null;
    canvasStreamRef.current?.getTracks().forEach(t => t.stop());
    canvasStreamRef.current = null;
  }, []);

  /**
   * Digital-zoom recording pipeline for devices with no caps.zoom (desktops,
   * Firefox). Draws the live video center-cropped by the CURRENT zoom factor
   * into a canvas and records canvas.captureStream + the original audio, so
   * what you see is exactly what lands in the file — even if you zoom
   * mid-take. Returns null when unsupported so the caller can fall back to
   * recording the raw stream (zoom then preview-only, but never a crash).
   */
  const startCanvasPipeline = useCallback((raw: MediaStream): MediaStream | null => {
    const videoEl = videoRef.current;
    const canvas = canvasRef.current;
    if (!videoEl || !canvas || typeof canvas.captureStream !== 'function') return null;
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (!w || !h) return null;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    canvasDrawingRef.current = true;
    const draw = () => {
      if (!canvasDrawingRef.current) return;
      const z = Math.max(1, zoomRef.current);
      const sw = w / z;
      const sh = h / z;
      // Draw the RAW video element — for the front camera the mirror is
      // preview-only CSS, so the canvas (and the recording) stays unflipped,
      // matching the /create convention.
      ctx.drawImage(videoEl, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, w, h);
      canvasRafRef.current = requestAnimationFrame(draw);
    };
    draw();
    const cs = canvas.captureStream(30);
    canvasStreamRef.current = cs;
    const vTrack = cs.getVideoTracks()[0];
    if (!vTrack) { stopCanvasPipeline(); return null; }
    return new MediaStream([vTrack, ...raw.getAudioTracks()]);
  }, [stopCanvasPipeline]);

  const startCamera = useCallback(async () => {
    setPermState('requesting');
    setMediaError(null);
    try {
      const audioConstraints: MediaTrackConstraints = prefs.micDeviceId
        ? { deviceId: { exact: prefs.micDeviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: false }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: false };

      // videoDeviceIdRef pins a specific videoinput (iOS ultra-wide = the 0.5x
      // lens, which Safari exposes as a separate device instead of zoom < 1).
      const baseVideo: MediaTrackConstraints = {
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        frameRate: { ideal: 30 },
      };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: videoDeviceIdRef.current
            ? { ...baseVideo, deviceId: { exact: videoDeviceIdRef.current } }
            : { ...baseVideo, facingMode: prefs.facingMode },
        });
      } catch (pinnedErr) {
        // Pinned ultra-wide grab failed (device busy / gone after an OS
        // update): fall back to the regular facingMode lens instead of
        // dead-ending the whole camera.
        if (!videoDeviceIdRef.current) throw pinnedErr;
        videoDeviceIdRef.current = null;
        pendingZoomRef.current = null;
        setUsingUltraWide(false);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: { ...baseVideo, facingMode: prefs.facingMode },
        });
      }

      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Probe what this lens can actually do. getCapabilities is missing on
      // Firefox and older Safari, so every camera control is gated off this.
      const vTrack = stream.getVideoTracks()[0];
      let caps: CameraCapabilities | undefined;
      try {
        caps = typeof vTrack?.getCapabilities === 'function'
          ? vTrack.getCapabilities() as CameraCapabilities
          : undefined;
      } catch { caps = undefined; }
      const zc = caps?.zoom
        && typeof caps.zoom.min === 'number'
        && typeof caps.zoom.max === 'number'
        && caps.zoom.max > caps.zoom.min
        ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step }
        : null;
      zoomCapsRef.current = zc;
      setZoomCaps(zc);
      setTorchSupported(caps?.torch === true);
      setTorchOn(false); // torch resets whenever the track restarts

      // Fresh lens = fresh zoom. If a lens switch queued a zoom (e.g. tapped
      // 2x while on the ultra-wide device), apply it now that caps are known.
      zoomRef.current = 1;
      setZoom(1);
      const queued = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (queued && queued !== 1) setZoomLevel(queued);

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
  }, [prefs.micDeviceId, prefs.facingMode, refreshMics, stopMeter, setZoomLevel]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      stopMeter();
      stopCanvasPipeline();
      if (tickRef.current) clearInterval(tickRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (zoomHudTimerRef.current) clearTimeout(zoomHudTimerRef.current);
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
      // WYSIWYG zoom: with native caps.zoom the camera driver already bakes
      // the zoom into the raw stream. Without it (desktop/Firefox) we record
      // the canvas-crop pipeline instead, so digital zoom lands in the file
      // too. Null fallback = raw stream, zoom preview-only, never a crash.
      let recStream: MediaStream = streamRef.current;
      if (!zoomCapsRef.current) {
        recStream = startCanvasPipeline(streamRef.current) ?? streamRef.current;
      }
      const rec = new MediaRecorder(recStream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        // Tear down the canvas pipeline AFTER the final dataavailable so the
        // last frames make it into the blob.
        stopCanvasPipeline();
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
      stopCanvasPipeline();
      setMediaError(err?.message || 'Recording failed to start.');
    }
  }, [recording, startCanvasPipeline, stopCanvasPipeline]);

  const stopRecording = useCallback(() => {
    if (!recording || !recorderRef.current) return;
    try { recorderRef.current.stop(); } catch {}
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setRecording(false);
  }, [recording]);

  /**
   * Capability-driven lens pills. Only render what THIS device can do:
   *   - 0.5x: native when the zoom range dips below 1 (many Androids expose
   *     min 0.5 — that IS the .5 setting), else the iOS ultra-wide device.
   *   - 1x/2x/3x: native zoom clamped to caps range, or digital up to 3x.
   */
  const lensPills = useMemo<LensPill[]>(() => {
    const pills: LensPill[] = [];
    if (zoomCaps && zoomCaps.min < 1) {
      pills.push({ label: '.5', value: Math.max(zoomCaps.min, 0.5), kind: 'zoom' });
    } else if (ultraWideId && prefs.facingMode === 'environment') {
      pills.push({ label: '.5', value: 0.5, kind: 'ultrawide-device' });
    }
    const maxZoom = zoomCaps ? zoomCaps.max : DIGITAL_ZOOM_MAX;
    for (const v of [1, 2, 3]) {
      if (v <= maxZoom) pills.push({ label: String(v), value: v, kind: 'zoom' });
    }
    return pills;
  }, [zoomCaps, ultraWideId, prefs.facingMode]);

  // Any pill that requires swapping the videoinput (vs just a constraint)?
  // Those are locked while recording — MediaRecorder dies on track swaps.
  const hasDeviceSwitchPill = usingUltraWide || lensPills.some(p => p.kind === 'ultrawide-device');

  const selectLens = useCallback((pill: LensPill) => {
    // On the ultra-wide DEVICE, even "1x" means switching back to the main
    // lens — so everything is a device switch until we leave ultra-wide.
    const switchesDevice = pill.kind === 'ultrawide-device' || usingUltraWide;
    if (switchesDevice) {
      if (recording) return; // locked mid-take; UI shows the hint
      if (pill.kind === 'ultrawide-device') {
        videoDeviceIdRef.current = ultraWideId;
        setUsingUltraWide(true);
      } else {
        videoDeviceIdRef.current = null;
        setUsingUltraWide(false);
        pendingZoomRef.current = pill.value; // applied once the main lens is live
      }
      startCamera();
      return;
    }
    setZoomLevel(pill.value);
  }, [usingUltraWide, recording, ultraWideId, startCamera, setZoomLevel]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as CameraConstraintSet] });
      setTorchOn(next);
    } catch { /* some devices report torch but reject while another app holds it */ }
  }, [torchOn]);

  const flipCamera = useCallback(() => {
    if (recording) return; // track swap kills the active MediaRecorder
    videoDeviceIdRef.current = null; // flipping always leaves ultra-wide mode
    setUsingUltraWide(false);
    setPrefs(p => ({ ...p, facingMode: p.facingMode === 'user' ? 'environment' : 'user' }));
  }, [recording]);

  // --- Pinch-to-zoom + double-tap-to-reset on the preview ---
  const onPreviewTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchActiveRef.current = true;
      pinchRef.current = { startDist: touchDist(e.touches), startZoom: zoomRef.current };
    }
  }, []);

  const onPreviewTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current && pinchRef.current.startDist > 0) {
      setZoomLevel(pinchRef.current.startZoom * (touchDist(e.touches) / pinchRef.current.startDist));
    }
  }, [setZoomLevel]);

  const onPreviewTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) {
      // Double-tap resets to 1x — but never count a pinch release as a tap.
      if (!pinchActiveRef.current) {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          setZoomLevel(1);
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }
      pinchActiveRef.current = false;
    }
  }, [setZoomLevel]);

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
        // Shape matches GET /api/create/jobs: each job carries its rendered
        // clips (ve_rendered_clips.output_url). The render worker never writes
        // context_json.final_url — clips[].output_url is the real video URL.
        type JobRow = {
          id: string;
          status: string;
          context_json?: { progress?: number; final_url?: string; thumb_url?: string };
          clips?: { output_url: string | null; status: string }[];
          error_message?: string;
        };
        const j = await r.json() as { ok: boolean; jobs?: JobRow[]; rows?: JobRow[]; data?: JobRow[] };
        const rows = j.jobs || j.rows || j.data || [];
        setClips(prev => prev.map(p => {
          if (!p.run_id) return p;
          const row = rows.find(r => r.id === p.run_id);
          if (!row) return p;
          const ctx = row.context_json || {};
          const progress = typeof ctx.progress === 'number' ? ctx.progress : p.progress;
          // ctx.final_url kept first for any legacy rows; the worker actually
          // delivers the URL via clips[].output_url.
          const finalUrl = ctx.final_url || row.clips?.find(c => c.output_url)?.output_url || undefined;
          const thumbUrl = ctx.thumb_url;
          // 'complete' is what web/scripts/render-worker.ts writes on success.
          // It was missing here, so clips sat at "Polishing 100%" forever.
          if (['complete', 'done', 'ready', 'completed'].includes(row.status)) {
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

  // "0.5x" when riding the iOS ultra-wide device at rest, else live zoom.
  const zoomLabel = usingUltraWide && zoom === 1
    ? '0.5x'
    : `${(Math.round(zoom * 10) / 10).toFixed(1).replace(/\.0$/, '')}x`;
  const sliderMin = zoomCaps ? zoomCaps.min : 1;
  const sliderMax = zoomCaps ? zoomCaps.max : DIGITAL_ZOOM_MAX;

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      <PWAInstaller />

      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          // Same convention as /create: front-camera PREVIEW is mirrored,
          // the recording stays unflipped. Digital zoom (no caps.zoom) also
          // scales the preview here to match the canvas crop the recorder sees.
          transform: [
            prefs.facingMode === 'user' ? 'scaleX(-1)' : '',
            !zoomCaps && zoom > 1 ? `scale(${zoom})` : '',
          ].filter(Boolean).join(' ') || 'none',
        }}
      />

      {/* Recorder source for digital zoom — never visible. */}
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      {/* Pinch-to-zoom / double-tap-reset surface. z-10 keeps it under the
          control layers (z-20) so buttons stay tappable; touch-action none
          stops iOS from page-zooming instead of camera-zooming. */}
      <div
        className="absolute inset-0 z-10"
        style={{ touchAction: 'none' }}
        onTouchStart={onPreviewTouchStart}
        onTouchMove={onPreviewTouchMove}
        onTouchEnd={onPreviewTouchEnd}
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

        {/* Lens / zoom cluster — bottom-center so it's thumb-reachable and
            stays off the subject's face. Everything here is capability-gated:
            no zoom caps + no ultra-wide + no torch → nothing renders. */}
        {permState === 'granted' && (
          <div className="mb-4 flex flex-col items-center gap-2">
            <div
              aria-live="polite"
              className={`px-2.5 py-1 rounded-full bg-black/50 backdrop-blur border border-white/10 text-xs font-semibold tabular-nums transition-opacity duration-500 ${zoomHudVisible ? 'opacity-100' : 'opacity-0'}`}
            >
              {zoomLabel}
            </div>
            {(zoom !== 1 || zoomHudVisible) && sliderMax > sliderMin && (
              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                aria-label="Fine zoom"
                className="w-44 accent-teal-400"
              />
            )}
            {(lensPills.length > 1 || torchSupported) && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-black/40 backdrop-blur border border-white/10">
                {lensPills.length > 1 && (() => {
                  // Active pill = camera-app style: the ultra-wide pill while
                  // pinned to that device, else the largest zoom pill not
                  // above the current zoom.
                  const activePill = usingUltraWide
                    ? lensPills.find(p => p.kind === 'ultrawide-device')
                    : lensPills.filter(p => p.kind === 'zoom' && p.value <= zoom + 0.001).slice(-1)[0]
                      ?? lensPills.find(p => p.kind === 'zoom');
                  return lensPills.map((p) => {
                  const active = p === activePill;
                  const locked = recording && (p.kind === 'ultrawide-device' || usingUltraWide) && !active;
                  return (
                    <button
                      key={`${p.kind}-${p.label}`}
                      onClick={() => selectLens(p)}
                      disabled={locked}
                      aria-label={`${p.label}x lens`}
                      className={`w-9 h-9 rounded-full text-[11px] font-bold transition-colors ${active ? 'bg-white text-black' : 'text-white/90 hover:bg-white/10'} ${locked ? 'opacity-40' : ''}`}
                    >
                      {active ? zoomLabel : p.label}
                    </button>
                  );
                  });
                })()}
                {torchSupported && (
                  <button
                    onClick={toggleTorch}
                    aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${torchOn ? 'bg-amber-400 text-black' : 'text-white/90 hover:bg-white/10'}`}
                  >
                    {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                  </button>
                )}
              </div>
            )}
            {recording && hasDeviceSwitchPill && (
              <div className="text-[10px] text-zinc-300/80">finish take to switch lens</div>
            )}
          </div>
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
            {hasMultipleCameras && (
              <button
                onClick={flipCamera}
                disabled={recording}
                className="p-3 rounded-full bg-black/40 backdrop-blur border border-white/10 disabled:opacity-40"
                aria-label="Flip camera"
                title={recording ? 'Finish take to flip camera' : 'Flip camera'}
              >
                <SwitchCamera className="w-5 h-5" />
              </button>
            )}
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
