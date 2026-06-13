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
  Zap, ZapOff, Pause, ScrollText, PenLine,
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

// Teleprompter handoff + prefs. 'ff-teleprompter' is WRITTEN by
// /script-generator's "Send to teleprompter" button ({ script, ts }) and
// READ here — localStorage so the bridge works with zero backend and even
// logged-out. Speed/size live in a separate key so clearing a script never
// nukes the user's reading preferences.
const TELEPROMPTER_KEY = 'ff-teleprompter';
const TELEPROMPTER_PREFS_KEY = 'ff-teleprompter-prefs';
// Remembers the last saved-script the user loaded in the picker (id + title)
// so re-opening the picker can mark it, and so a returning session knows which
// of his scripts was on the prompter. Separate from the SCRIPT TEXT in
// TELEPROMPTER_KEY — clearing/editing the text never forgets the choice.
const TELEPROMPTER_LAST_KEY = 'ff-teleprompter-last';
// The "flow" lineup: an ordered list of scripts the creator queues up. After
// each take finishes, the prompter auto-advances to the next one so they can
// just keep hitting record. Persisted so a returning session keeps the lineup.
// Shape: { items: SavedScript[]; index: number }.
const TELEPROMPTER_QUEUE_KEY = 'ff-teleprompter-queue';

// Shape returned by GET /api/teleprompter/scripts — the picker contract.
interface SavedScript {
  id: string;
  title: string;
  text: string;
}

type Beauty = 'off' | 'soft' | 'smooth';

// Snapchat/TikTok-style "minor filter": a soft-focus beauty pass that evens
// skin tone and softens minor imperfections. Implemented as a CSS/canvas
// filter (no ML) so it's real-time AND bakes identically into the recording
// via the canvas pipeline — what you see in preview is what records.
const BEAUTY_FILTERS: Record<Beauty, string> = {
  off: '',
  soft: 'brightness(1.04) saturate(1.06) contrast(0.99) blur(0.5px)',
  smooth: 'brightness(1.06) saturate(1.09) contrast(0.98) blur(1px)',
};
const BEAUTY_OPTS: { key: Beauty; label: string; hint: string }[] = [
  { key: 'off', label: 'Off', hint: 'No filter' },
  { key: 'soft', label: 'Soft', hint: 'Subtle smoothing' },
  { key: 'smooth', label: 'Smooth', hint: 'Stronger glow' },
];

interface Prefs {
  vibe: Vibe;
  captionStyle: string;
  addBroll: boolean;
  addMusic: boolean;
  facingMode: 'user' | 'environment';
  micDeviceId: string | null;
  describe: string;
  beauty: Beauty;
}

const DEFAULT_PREFS: Prefs = {
  vibe: 'real',
  captionStyle: 'karaoke',
  addBroll: false,
  addMusic: false,
  facingMode: 'user',
  micDeviceId: null,
  describe: '',
  beauty: 'off',
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
  /** 'zoom' = constraint on the current track; 'ultrawide-device' = swap to
   *  the separate ultra-wide videoinput; 'unavailable' = honest disabled .5
   *  pill — this camera has neither native zoom<1 nor a wider lens device. */
  kind: 'zoom' | 'ultrawide-device' | 'unavailable';
}

/**
 * The 0.5x back lens is often a SEPARATE videoinput rather than zoom<1 —
 * iOS Safari always does this ("Back Ultra Wide Camera"), and several
 * Androids (Samsung/Pixel on Chrome) expose it the same way once camera
 * permission is granted. Match on label across ALL platforms (was iOS-only
 * thinking — Brandon's Android had no .5 pill because of it); exclude
 * front/selfie lenses so a front-facing wide never hijacks the pill.
 */
function isUltraWideLabel(label: string): boolean {
  return /ultra[- ]?wide|0\.5|wide angle/i.test(label) && !/front|user|selfie/i.test(label);
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
  // Pause/resume: 'paused' only ever true while recording. pauseSupported is
  // feature-detected per-recorder (MediaRecorder.pause exists in all modern
  // browsers, but hide the button rather than crash on an odd UA).
  const [paused, setPaused] = useState(false);
  const [pauseSupported, setPauseSupported] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [mics, setMics] = useState<MicDevice[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  // Camera diagnostics for the .5/lens issue — visible only at /studio?debug=1.
  // Lets us SEE exactly what lenses a given phone exposes to the browser
  // (Android often hides the ultra-wide from getUserMedia) so .5 can be wired
  // to the real device instead of guessing by label.
  const [camList, setCamList] = useState<string[]>([]);
  const [debug, setDebug] = useState(false);
  useEffect(() => {
    try { setDebug(new URLSearchParams(window.location.search).get('debug') === '1'); } catch {}
  }, []);

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
  // Paused-time bookkeeping so the timer (and clip duration) count RECORDED
  // time, not wall-clock time: pausedAccumRef = total ms of finished pauses
  // this take; pauseStartRef = when the current pause began (null = live).
  const pausedAccumRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);
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
  // Portrait-fix (2026-06-12 "camera is sideways / video half the screen"):
  // set when the camera hands us a LANDSCAPE track (w>h) even though we asked
  // for 1080x1920 — common on Android Chrome where the sensor-native
  // landscape mode wins. The preview looks fine (object-cover crops it), but
  // recording that raw track ships a sideways file the renderer letterboxes.
  // When set, startRecording routes through the canvas pipeline, which
  // center-crops every frame to real 9:16 so the FILE matches the preview.
  const portraitFixRef = useRef(false);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const canvasRafRef = useRef<number | null>(null);
  const canvasDrawingRef = useRef(false);
  // Pinch / double-tap gesture state.
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const pinchActiveRef = useRef(false);
  const lastTapRef = useRef(0);

  // Beauty filter string mirrored into a ref so the canvas draw loop (and the
  // record-pipeline gate) read the live value without re-subscribing.
  const beautyFilterRef = useRef('');
  useEffect(() => { beautyFilterRef.current = BEAUTY_FILTERS[prefs.beauty] || ''; }, [prefs.beauty]);

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
      // Diagnostic: every videoinput label the browser exposes. On phones that
      // hide the ultra-wide this is how we learn what's actually selectable.
      setCamList(cams.map((c, i) => `${i}: ${c.label || '(no label — perm?)'}`));
      console.log('[studio] videoinputs', cams.map(c => c.label || '(no label)'));

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
   * Canvas recording pipeline. Two jobs, same plumbing:
   *   1. Digital zoom for devices with no caps.zoom (desktops, Firefox) —
   *      draws the live video center-cropped by the CURRENT zoom factor.
   *   2. Portrait-fix for Android tracks that arrive LANDSCAPE — the canvas
   *      becomes the 9:16 center cut of the frame so the recorded FILE is
   *      upright, exactly matching the object-cover preview. Browsers apply
   *      rotation metadata before frames hit the <video> element, so if
   *      videoWidth > videoHeight the pixels really are landscape — a center
   *      CROP (not a rotate) is the correct move.
   * Records canvas.captureStream + the original audio, so what you see is
   * exactly what lands in the file — even if you zoom mid-take. Returns null
   * when unsupported so the caller can fall back to recording the raw stream
   * (degraded, but never a crash).
   */
  const startCanvasPipeline = useCallback((raw: MediaStream): MediaStream | null => {
    const videoEl = videoRef.current;
    const canvas = canvasRef.current;
    if (!videoEl || !canvas || typeof canvas.captureStream !== 'function') return null;
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (!w || !h) return null;
    // Landscape track → portrait canvas (9:16 of the frame height). Even-dim
    // rounding keeps yuv420 encoders happy. Otherwise canvas = native dims.
    const portraitFix = portraitFixRef.current && w > h;
    const cw = portraitFix ? Math.floor((h * 9 / 16) / 2) * 2 : w;
    const ch = h;
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    canvasDrawingRef.current = true;
    const draw = () => {
      if (!canvasDrawingRef.current) return;
      // Native caps.zoom is already baked into the raw frames by the camera
      // driver — only the digital path applies zoomRef here, otherwise zoom
      // would double-apply when portrait-fix rides on a native-zoom camera.
      const z = zoomCapsRef.current ? 1 : Math.max(1, zoomRef.current);
      const sw = cw / z;
      const sh = ch / z;
      // Beauty filter: bake the same soft-focus pass the preview shows so the
      // recorded FILE matches WYSIWYG. 'none' when off (no perf cost).
      ctx.filter = beautyFilterRef.current || 'none';
      // Draw the RAW video element — for the front camera the mirror is
      // preview-only CSS, so the canvas (and the recording) stays unflipped,
      // matching the /create convention.
      ctx.drawImage(videoEl, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, cw, ch);
      ctx.filter = 'none';
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
        // Belt-and-braces portrait ask: some Android camera HALs ignore the
        // w/h hint but honor aspectRatio. `ideal` keeps it a preference, so
        // browsers/devices that can't do 9:16 still return a track instead
        // of throwing OverconstrainedError.
        aspectRatio: { ideal: 9 / 16 },
        frameRate: { ideal: 30 },
        // 2026-06-13 Brandon: "too close even at 1x, can't zoom out." Several
        // phones satisfy a high portrait resolution by CENTER-CROPPING the
        // sensor (a zoomed-in slice) instead of using the full field of view.
        // resizeMode 'none' tells the browser to hand back the camera's NATIVE
        // uncropped frames — the widest view the lens actually sees — and the
        // preview (object-cover) + canvas already frame it to 9:16. Not in the
        // stock TS type, so widen the constraint shape.
        resizeMode: 'none',
      } as MediaTrackConstraints & { resizeMode?: string };
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

      // WYSIWYG orientation guard: if the track came back LANDSCAPE despite
      // the portrait ask, flag it so recording goes through the canvas crop.
      // Breadcrumb stays in the console so a "sideways video" report can be
      // confirmed from a remote-debug session in seconds.
      let trackSettings: MediaTrackSettings | undefined;
      try { trackSettings = typeof vTrack?.getSettings === 'function' ? vTrack.getSettings() : undefined; } catch { trackSettings = undefined; }
      const landscapeTrack = !!(trackSettings?.width && trackSettings?.height && trackSettings.width > trackSettings.height);
      portraitFixRef.current = landscapeTrack;
      if (landscapeTrack) {
        console.warn(`[studio] camera delivered a landscape track ${trackSettings?.width}x${trackSettings?.height} — recordings will be canvas-cropped to upright 9:16`);
      }
      // Zoom breadcrumb (Brandon: "needs a .5 setting") — one line tells us
      // whether THIS lens reports zoom<1 natively, what range it has, and
      // what resolution the track actually settled on.
      console.log('[studio] lens caps', {
        zoom: zc,
        torch: caps?.torch === true,
        track: trackSettings?.width ? `${trackSettings.width}x${trackSettings.height}` : 'unknown',
      });

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
      // WYSIWYG zoom + orientation: with native caps.zoom the camera driver
      // already bakes zoom into the raw stream, so we can record it directly —
      // UNLESS the track came back landscape (portraitFixRef), in which case
      // the canvas pipeline crops every frame to upright 9:16 so the file
      // matches the portrait preview instead of rendering as a sideways
      // letterboxed strip. Without native zoom (desktop/Firefox) the canvas
      // path also bakes in digital zoom. Null fallback = raw stream, never a
      // crash — just log it so a bad upload can be explained.
      let recStream: MediaStream = streamRef.current;
      if (!zoomCapsRef.current || portraitFixRef.current || beautyFilterRef.current) {
        recStream = startCanvasPipeline(streamRef.current) ?? streamRef.current;
        if (portraitFixRef.current && recStream === streamRef.current) {
          console.warn('[studio] portrait-fix canvas unavailable — recording the raw landscape track');
        }
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
        // Recorded duration excludes paused stretches — recorder.pause()
        // stops capturing, so wall-clock would overstate the clip length.
        // stopRecording() finalizes pausedAccumRef before stop(), so any
        // in-flight pause is already folded in by the time onstop fires.
        const duration = (Date.now() - recStartRef.current - pausedAccumRef.current) / 1000;
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
      pausedAccumRef.current = 0;
      pauseStartRef.current = null;
      setPaused(false);
      // Feature-detect pause/resume per-recorder so the pause button only
      // renders when the UA can actually honor it.
      setPauseSupported(typeof rec.pause === 'function' && typeof rec.resume === 'function');
      setRecElapsed(0);
      tickRef.current = setInterval(() => {
        // Recorded-time timer: subtract finished pauses plus the live one.
        // While paused, (now - pauseStart) grows at the same rate as now, so
        // the displayed elapsed freezes instead of creeping.
        const livePause = pauseStartRef.current != null ? Date.now() - pauseStartRef.current : 0;
        setRecElapsed(Math.max(0, Math.floor((Date.now() - recStartRef.current - pausedAccumRef.current - livePause) / 1000)));
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
    // Stopping from PAUSED is fine — MediaRecorder.stop() finalizes from
    // either state. Fold any in-flight pause into the accumulator FIRST so
    // onstop's duration math sees the complete paused total.
    if (pauseStartRef.current != null) {
      pausedAccumRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    try { recorderRef.current.stop(); } catch {}
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setRecording(false);
    setPaused(false);
  }, [recording]);

  /**
   * Pause/resume via the native MediaRecorder API.
   *
   * Camera-feature interplay (same rules as while actively recording):
   *   - Lens/device switches and flips stay LOCKED — the recorder still holds
   *     the track, and swapping it kills the recording (the `recording` state
   *     stays true through a pause, so every existing guard keeps working).
   *   - Zoom keeps working: native zoom constraints apply to the held track,
   *     and on the digital path the canvas rAF draw loop keeps running while
   *     paused (recorder.pause() just stops consuming frames), so resume picks
   *     up live frames with zero frozen-frame gap.
   */
  const pauseRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!recording || paused || !rec || typeof rec.pause !== 'function') return;
    // Guard the call: some UAs throw InvalidStateError if state already moved
    // (e.g. stop raced in) — bail without flipping UI state in that case.
    try { rec.pause(); } catch { return; }
    pauseStartRef.current = Date.now();
    setPaused(true);
  }, [recording, paused]);

  const resumeRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!recording || !paused || !rec || typeof rec.resume !== 'function') return;
    try { rec.resume(); } catch { return; }
    if (pauseStartRef.current != null) {
      pausedAccumRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    setPaused(false);
  }, [recording, paused]);

  /**
   * Capability-driven lens pills. Only render what THIS device can do:
   *   - 0.5x: native when the zoom range dips below 1 (many Androids expose
   *     min 0.5 — that IS the .5 setting), else the separate ultra-wide
   *     videoinput (iOS always, some Androids).
   *   - Back camera with zoom caps but NEITHER of the above: a disabled .5
   *     pill with a tooltip, so the honest answer is "this phone can't"
   *     instead of users hunting for a hidden setting.
   *   - 1x/2x/3x: native zoom clamped to caps range, or digital up to 3x.
   */
  const lensPills = useMemo<LensPill[]>(() => {
    const pills: LensPill[] = [];
    if (zoomCaps && zoomCaps.min < 1) {
      // Label with the REAL min so a 0.6x camera doesn't claim ".5".
      const v = Math.max(zoomCaps.min, 0.5);
      pills.push({ label: v.toFixed(1).replace(/^0/, '').replace(/\.0$/, ''), value: v, kind: 'zoom' });
    } else if (ultraWideId && prefs.facingMode === 'environment') {
      pills.push({ label: '.5', value: 0.5, kind: 'ultrawide-device' });
    } else if (zoomCaps && prefs.facingMode === 'environment') {
      pills.push({ label: '.5', value: 0.5, kind: 'unavailable' });
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
    if (pill.kind === 'unavailable') return; // disabled pill — nothing to select
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
          // Beauty filter on the live preview — matched by the canvas pipeline
          // so the recording looks identical.
          filter: BEAUTY_FILTERS[prefs.beauty] || 'none',
        }}
      />

      {/* Recorder source for digital zoom — never visible. */}
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      {/* Lens diagnostics — /studio?debug=1 only. Screenshot this to wire .5. */}
      {debug && (
        <div className="absolute top-24 left-2 z-30 max-w-[92%] p-2 rounded-lg bg-black/80 border border-teal-400/40 text-[10px] leading-snug font-mono text-teal-100 pointer-events-none">
          <div>facing: {prefs.facingMode}</div>
          <div>zoomCaps: {zoomCaps ? `min ${zoomCaps.min} / max ${zoomCaps.max}` : 'NONE (no native zoom)'}</div>
          <div>ultraWide detected: {ultraWideId ? 'YES' : 'no'} · usingUW: {usingUltraWide ? 'yes' : 'no'}</div>
          <div>cameras ({camList.length}):</div>
          {camList.map((c, i) => <div key={i} className="truncate">· {c}</div>)}
        </div>
      )}

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

      {/* Teleprompter — z-[15] keeps it above the pinch surface (z-10) so
          taps reach the scroller, but below every control cluster (z-20).
          Recording/paused are passed so the scroll follows the take. */}
      <TeleprompterOverlay recording={recording} paused={paused} />

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

      {/* Recording state pill — amber + pulsing while paused so it's obvious
          at a glance that frames are NOT being captured right now. */}
      {recording && (
        paused ? (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full bg-amber-500 text-black font-bold text-sm flex items-center gap-2 shadow-lg animate-pulse">
            <Pause className="w-3.5 h-3.5 fill-current" />
            Paused {fmtElapsed(recElapsed)}
          </div>
        ) : (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full bg-red-600 text-white font-bold text-sm flex items-center gap-2 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            REC {fmtElapsed(recElapsed)}
          </div>
        )
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
                  // 'unavailable' = honest dead-end: rendered but disabled,
                  // tooltip explains why instead of the pill just missing.
                  const unavailable = p.kind === 'unavailable';
                  return (
                    <button
                      key={`${p.kind}-${p.label}`}
                      onClick={() => selectLens(p)}
                      disabled={locked || unavailable}
                      aria-label={unavailable ? 'No wider lens on this camera' : `${p.label}x lens`}
                      title={unavailable ? 'This camera has no wider lens' : undefined}
                      className={`w-9 h-9 rounded-full text-[11px] font-bold transition-colors ${active ? 'bg-white text-black' : 'text-white/90 hover:bg-white/10'} ${locked || unavailable ? 'opacity-40' : ''}`}
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
            {/* Mid-take the vibe pill gives way to pause/resume — same slot
                keeps the record button centered, and changing vibe mid-take
                wouldn't affect this clip's job anyway. Hidden entirely when
                the UA's MediaRecorder lacks pause(). */}
            {recording && pauseSupported ? (
              <button
                onClick={paused ? resumeRecording : pauseRecording}
                aria-label={paused ? 'Resume recording' : 'Pause recording'}
                className={`p-3 rounded-full bg-black/40 backdrop-blur border transition-colors active:scale-95 ${paused ? 'border-amber-400/70 text-amber-300' : 'border-white/10 text-white'}`}
              >
                {paused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
              </button>
            ) : !recording ? (
              <VibePill vibe={prefs.vibe} onClick={() => setShowSettings(true)} />
            ) : null}
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
          {recording
            ? (paused
              ? 'Paused. Tap ▶ to keep going, or stop to finish the take.'
              : 'Tap stop. Next take queues automatically.')
            : 'Record. Stop. Record again. Polish happens in the background.'}
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

          <Section title="Beauty filter">
            <div className="grid grid-cols-3 gap-2">
              {BEAUTY_OPTS.map(b => {
                const sel = prefs.beauty === b.key;
                return (
                  <button
                    key={b.key}
                    onClick={() => setPrefs(p => ({ ...p, beauty: b.key }))}
                    className={`px-3 py-2 rounded-lg text-sm border text-center ${sel ? 'bg-teal-600/20 border-teal-500' : 'bg-zinc-900 border-white/10'}`}
                  >
                    <div className="font-medium">{b.label}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{b.hint}</div>
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-zinc-500 mt-2">Smooths skin + minor imperfections. Bakes into the recording.</div>
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

// ---------------------------------------------------------------------------
// Teleprompter (2026-06-12, Brandon-locked: auto-scroll + speed control)
// ---------------------------------------------------------------------------

/**
 * Auto-scrolling teleprompter over the TOP ~40% of the camera preview.
 *
 * Why the top 40%: the creator frames their face center/lower-third, so the
 * script floats near the lens (closest to eye contact) and the gradient fades
 * to transparent before it reaches the face area. Why a gradient instead of a
 * solid panel: the creator still needs to see their framing underneath.
 *
 * Behavior contract:
 *   - Script arrives via localStorage 'ff-teleprompter' (written by
 *     /script-generator's "Send to teleprompter"); no script = a small pill
 *     that opens a paste box, so studio-first users aren't locked out.
 *   - Starts PAUSED. Tap the text to toggle. Auto-plays from the top when
 *     recording starts (fresh take = read from the top), pauses with the
 *     recording's pause button, resumes on resume, stops when the take stops.
 *   - Speed (0.5x–3x) + font size persist in 'ff-teleprompter-prefs' so the
 *     creator dials in a reading pace once, ever.
 */
function TeleprompterOverlay({ recording, paused }: { recording: boolean; paused: boolean }) {
  const [script, setScript] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);       // 0.5x – 3x
  const [fontSize, setFontSizeState] = useState(22); // px, 14–34
  const [showPaste, setShowPaste] = useState(false);
  const [draft, setDraft] = useState('');

  // --- Saved-script picker ---
  // The in-studio path: pull the user's saved scripts and tap one to load it,
  // instead of copy/pasting. 'auth' fetchState means we got a 401 (logged out)
  // — picker then shows the paste fallback + a sign-in nudge.
  const [showPicker, setShowPicker] = useState(false);
  const [savedScripts, setSavedScripts] = useState<SavedScript[]>([]);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'ready' | 'auth' | 'error'>('idle');
  const [lastScriptId, setLastScriptId] = useState<string | null>(null);

  // --- Lineup / "flow" queue ---
  // queue is the ordered lineup of scripts; queueIndex is which one is live on
  // the prompter. A single loaded script is just a queue of length 1, so the
  // header/next/prev only show when there are 2+. autoAdvanced flips true right
  // after a take bumps the index, so the UI can flash a "Next up" cue.
  const [queue, setQueue] = useState<SavedScript[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [justAdvanced, setJustAdvanced] = useState(false);
  // Build-a-lineup selection inside the picker (script ids, in tap order).
  const [pickIds, setPickIds] = useState<string[]>([]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  // True for exactly one scroll event after the rAF loop writes scrollTop, so
  // the onScroll handler can tell auto-scroll apart from a finger drag and only
  // capture the position when the USER moved it.
  const queueRef = useRef<SavedScript[]>([]);
  const queueIndexRef = useRef(0);
  // Float scroll position — scrollTop is integer-truncated on read, so
  // accumulating into it directly would stall at low speeds (sub-pixel per
  // frame adds to < 1 and truncates back to where it started).
  const posRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  // Refs mirror state so the rAF loop reads live values without restarting.
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const fontSizeRef = useRef(22);
  const prevRecordingRef = useRef(false);
  // Tap-vs-drag detector for the scroller: a still, quick press toggles
  // play/pause; a press that moves (finger drag / scrollbar) is a manual
  // scroll and must NOT toggle. Stores where/when the press began.
  const tapStartRef = useRef<{ y: number; top: number; t: number } | null>(null);

  // Load script + saved prefs once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TELEPROMPTER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { script?: string; ts?: number };
        if (parsed && typeof parsed.script === 'string' && parsed.script.trim()) {
          setScript(parsed.script);
          setOpen(true); // arrived from /script-generator — show it immediately
        }
      }
    } catch {}
    try {
      const raw = localStorage.getItem(TELEPROMPTER_PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { speed?: number; fontSize?: number };
        if (typeof p.speed === 'number' && p.speed >= 0.5 && p.speed <= 3) {
          setSpeedState(p.speed);
          speedRef.current = p.speed;
        }
        if (typeof p.fontSize === 'number' && p.fontSize >= 14 && p.fontSize <= 34) {
          setFontSizeState(p.fontSize);
          fontSizeRef.current = p.fontSize;
        }
      }
    } catch {}
    // Restore which saved script was last loaded (for the picker's "current"
    // marker). Text itself still comes from TELEPROMPTER_KEY above.
    try {
      const raw = localStorage.getItem(TELEPROMPTER_LAST_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { id?: string };
        if (typeof p.id === 'string') setLastScriptId(p.id);
      }
    } catch {}
    // Restore a lineup if one was queued before. The live script still comes
    // from TELEPROMPTER_KEY; the queue just tracks what's after it.
    try {
      const raw = localStorage.getItem(TELEPROMPTER_QUEUE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { items?: SavedScript[]; index?: number };
        if (Array.isArray(p.items) && p.items.length > 0) {
          setQueue(p.items);
          queueRef.current = p.items;
          const idx = typeof p.index === 'number' ? Math.min(Math.max(0, p.index), p.items.length - 1) : 0;
          setQueueIndex(idx);
          queueIndexRef.current = idx;
        }
      }
    } catch {}
  }, []);

  // Persist the lineup whenever it changes.
  const persistQueue = useCallback((items: SavedScript[], index: number) => {
    try {
      if (items.length === 0) localStorage.removeItem(TELEPROMPTER_QUEUE_KEY);
      else localStorage.setItem(TELEPROMPTER_QUEUE_KEY, JSON.stringify({ items, index }));
    } catch {}
  }, []);

  // --- Lineup navigation ---
  // Jump the prompter to a given script in the lineup. Resets scroll to the top
  // and parks (doesn't auto-play) — recording is what starts the read. Declared
  // up here because the recording-sync effect below references it.
  const goToQueueIndex = useCallback((idx: number) => {
    const items = queueRef.current;
    if (idx < 0 || idx >= items.length) return;
    queueIndexRef.current = idx;
    setQueueIndex(idx);
    persistQueue(items, idx);
    const s = items[idx];
    setScript(s.text);
    setOpen(true);
    setLastScriptId(s.id);
    posRef.current = 0;
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    setPlaying(false);
    try {
      localStorage.setItem(TELEPROMPTER_KEY, JSON.stringify({ script: s.text, ts: Date.now() }));
      localStorage.setItem(TELEPROMPTER_LAST_KEY, JSON.stringify({ id: s.id, title: s.title }));
    } catch {}
  }, [persistQueue]);

  const nextInQueue = useCallback(() => { goToQueueIndex(queueIndexRef.current + 1); }, [goToQueueIndex]);
  const prevInQueue = useCallback(() => { goToQueueIndex(queueIndexRef.current - 1); }, [goToQueueIndex]);

  const setSpeed = useCallback((v: number) => {
    const next = Math.min(3, Math.max(0.5, Math.round(v * 10) / 10));
    speedRef.current = next;
    setSpeedState(next);
    try { localStorage.setItem(TELEPROMPTER_PREFS_KEY, JSON.stringify({ speed: next, fontSize: fontSizeRef.current })); } catch {}
  }, []);

  const setFontSize = useCallback((delta: number) => {
    const next = Math.min(34, Math.max(14, fontSizeRef.current + delta));
    fontSizeRef.current = next;
    setFontSizeState(next);
    try { localStorage.setItem(TELEPROMPTER_PREFS_KEY, JSON.stringify({ speed: speedRef.current, fontSize: next })); } catch {}
  }, []);

  // The scroll engine. One rAF loop per play session; dt-based so speed is
  // framerate-independent. Base rate ≈ 0.55 lines/sec at 1x — calibrated to
  // a normal ~150wpm read with this column width — and scales with font size
  // so bigger text doesn't read as "slower".
  useEffect(() => {
    playingRef.current = playing;
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }
    const step = (ts: number) => {
      if (!playingRef.current) return;
      const el = scrollerRef.current;
      if (el) {
        const dt = lastTsRef.current != null ? Math.min(0.2, (ts - lastTsRef.current) / 1000) : 0;
        lastTsRef.current = ts;
        const lineHeight = fontSizeRef.current * 1.5;
        const max = Math.max(0, el.scrollHeight - el.clientHeight);
        posRef.current = Math.min(max, posRef.current + lineHeight * 0.55 * speedRef.current * dt);
        el.scrollTop = posRef.current;
        if (posRef.current >= max && max > 0) {
          // End of script: stop instead of spinning the loop forever.
          setPlaying(false);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  // Recording sync. New take = read from the top (take 2 shouldn't start
  // mid-script where take 1 died). Stop of the take parks the prompter.
  useEffect(() => {
    const was = prevRecordingRef.current;
    prevRecordingRef.current = recording;
    if (!script || !open) return;
    if (recording && !was) {
      posRef.current = 0;
      if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
      setPlaying(true);
    } else if (!recording && was) {
      setPlaying(false);
      // "Flow": a finished take advances the lineup so the next script is
      // already up when the creator hits record again. Flash a "Next up" cue.
      if (queueRef.current.length > 1 && queueIndexRef.current < queueRef.current.length - 1) {
        goToQueueIndex(queueIndexRef.current + 1);
        setJustAdvanced(true);
        setTimeout(() => setJustAdvanced(false), 4000);
      }
    }
  }, [recording, script, open, goToQueueIndex]);

  // Pause button on the recorder pauses the read too (and resume resumes) —
  // the whole point of pausing a take is to stop talking.
  useEffect(() => {
    if (!recording || !script || !open) return;
    setPlaying(!paused);
  }, [paused, recording, script, open]);

  // Shared loader: drop any text onto the prompter, reset scroll, persist it as
  // the active script. Used by both the paste box and the saved-script picker.
  const loadOntoPrompter = useCallback((text: string) => {
    setScript(text);
    setOpen(true);
    setShowPaste(false);
    setShowPicker(false);
    posRef.current = 0;
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    setPlaying(false);
    try { localStorage.setItem(TELEPROMPTER_KEY, JSON.stringify({ script: text, ts: Date.now() })); } catch {}
  }, []);

  // --- Manual scroll ---
  // The scroller is now overflow-y-auto so the creator can drag to any line.
  // Auto-scroll writes posRef THEN el.scrollTop = posRef, so a programmatic
  // scroll event lands with scrollTop ≈ posRef. A finger drag moves scrollTop
  // away from posRef — that's the only case we capture, and we feed the new
  // position back into posRef so auto-scroll resumes from where they parked it.
  const onScrollerScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (Math.abs(el.scrollTop - posRef.current) < 1.5) return;
    posRef.current = el.scrollTop;
  }, []);

  // Tap toggles play/pause, but only a TAP — a press that travels (a scroll
  // drag) is ignored so manual scrolling never accidentally starts/stops.
  const onScrollerPointerDown = useCallback((e: React.PointerEvent) => {
    const el = scrollerRef.current;
    tapStartRef.current = { y: e.clientY, top: el ? el.scrollTop : 0, t: Date.now() };
  }, []);
  const onScrollerPointerUp = useCallback((e: React.PointerEvent) => {
    const start = tapStartRef.current;
    tapStartRef.current = null;
    if (!start) return;
    const el = scrollerRef.current;
    const movedFinger = Math.abs(e.clientY - start.y) > 8;
    const movedScroll = el ? Math.abs(el.scrollTop - start.top) > 2 : false;
    const quick = Date.now() - start.t < 400;
    if (!movedFinger && !movedScroll && quick) setPlaying(p => !p);
  }, []);

  // Start a whole lineup from the picker's multi-select. Loads the first script
  // and stashes the rest so each finished take advances automatically.
  const startLineup = useCallback((items: SavedScript[]) => {
    if (items.length === 0) return;
    setQueue(items);
    queueRef.current = items;
    queueIndexRef.current = 0;
    setQueueIndex(0);
    persistQueue(items, 0);
    setPickIds([]);
    setShowPicker(false);
    const s = items[0];
    setScript(s.text);
    setOpen(true);
    setShowPaste(false);
    setLastScriptId(s.id);
    posRef.current = 0;
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    setPlaying(false);
    try {
      localStorage.setItem(TELEPROMPTER_KEY, JSON.stringify({ script: s.text, ts: Date.now() }));
      localStorage.setItem(TELEPROMPTER_LAST_KEY, JSON.stringify({ id: s.id, title: s.title }));
    } catch {}
  }, [persistQueue]);

  const clearLineup = useCallback(() => {
    setQueue([]);
    queueRef.current = [];
    queueIndexRef.current = 0;
    setQueueIndex(0);
    persistQueue([], 0);
  }, [persistQueue]);

  const savePasted = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    // Pasting is "my own text" — forget any previously-picked saved script so
    // the picker doesn't mis-mark a row as current.
    setLastScriptId(null);
    try { localStorage.removeItem(TELEPROMPTER_LAST_KEY); } catch {}
    loadOntoPrompter(text);
  }, [draft, loadOntoPrompter]);

  // Load a saved script from the picker. Remembers the choice so re-opening
  // the picker marks it as current.
  const loadSavedScript = useCallback((s: SavedScript) => {
    setLastScriptId(s.id);
    try { localStorage.setItem(TELEPROMPTER_LAST_KEY, JSON.stringify({ id: s.id, title: s.title })); } catch {}
    loadOntoPrompter(s.text);
  }, [loadOntoPrompter]);

  // Toggle a script in the build-a-lineup selection (order = tap order).
  const togglePick = useCallback((id: string) => {
    setPickIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  // Turn the current selection into action: 1 picked → load it solo (and clear
  // any old lineup); 2+ → start the lineup in tap order.
  const confirmPicks = useCallback(() => {
    const chosen = pickIds
      .map(id => savedScripts.find(s => s.id === id))
      .filter((s): s is SavedScript => !!s);
    if (chosen.length === 0) return;
    if (chosen.length === 1) {
      clearLineup();
      loadSavedScript(chosen[0]);
      setShowPicker(false);
      setPickIds([]);
      return;
    }
    startLineup(chosen);
  }, [pickIds, savedScripts, clearLineup, loadSavedScript, startLineup]);

  // Fetch the user's saved scripts. 401 → 'auth' (paste-only + sign-in nudge);
  // any other failure → 'error' (paste fallback). Re-runnable so the picker's
  // "Try again" works.
  const fetchSavedScripts = useCallback(async () => {
    setFetchState('loading');
    try {
      const r = await fetch('/api/teleprompter/scripts', { cache: 'no-store' });
      if (r.status === 401) { setFetchState('auth'); return; }
      if (!r.ok) { setFetchState('error'); return; }
      const j = await r.json() as { ok?: boolean; data?: SavedScript[] };
      setSavedScripts(Array.isArray(j.data) ? j.data : []);
      setFetchState('ready');
    } catch {
      setFetchState('error');
    }
  }, []);

  // Open the picker sheet, fetching on first open (or after a failure) so a
  // logged-in user sees their scripts without re-mounting.
  const openPicker = useCallback(() => {
    setShowPicker(true);
    if (fetchState === 'idle' || fetchState === 'error') fetchSavedScripts();
  }, [fetchState, fetchSavedScripts]);

  // Sits just below the top bar (back link / mic badge / settings ≈ 48px tall).
  const belowTopBar = 'calc(env(safe-area-inset-top) + 60px)';

  return (
    <>
      {/* Collapsed pill — opens the panel when a script is loaded, otherwise
          the saved-script PICKER (the in-studio path: load, don't paste). */}
      {!open && !showPaste && !showPicker && (
        <button
          onClick={() => { if (script) { setOpen(true); } else { openPicker(); } }}
          className="absolute left-3 z-20 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur border border-white/10 text-xs font-medium flex items-center gap-1.5"
          style={{ top: belowTopBar }}
          aria-label="Open teleprompter"
        >
          <ScrollText className="w-3.5 h-3.5 text-teal-300" /> Teleprompter
        </button>
      )}

      {open && script && (
        // pointer-events-none on the container so the lower (transparent)
        // part of the gradient never eats pinch-zoom/double-tap gestures;
        // only the scroller + control row re-enable pointer events.
        <div className="absolute top-0 inset-x-0 z-[15] h-[40%] flex flex-col pointer-events-none bg-gradient-to-b from-black/85 via-black/55 to-transparent">
          {/* Lineup header — only when 2+ scripts are queued. Shows position,
              the title, and prev/next so the creator can move through the
              "flow" by hand as well as on auto-advance. */}
          {queue.length > 1 && (
            <div
              className="pointer-events-auto px-3 flex items-center justify-center gap-2"
              style={{ marginTop: belowTopBar }}
            >
              <button
                onClick={prevInQueue}
                disabled={queueIndex === 0}
                aria-label="Previous script"
                className="p-1.5 rounded-full bg-black/40 backdrop-blur border border-white/10 disabled:opacity-30"
              >
                <ChevronUp className="w-3.5 h-3.5 -rotate-90" />
              </button>
              <div className={`px-3 py-1 rounded-full backdrop-blur border text-[11px] font-semibold flex items-center gap-1.5 max-w-[60%] ${justAdvanced ? 'bg-teal-500 text-black border-teal-300 animate-pulse' : 'bg-black/50 text-white border-white/10'}`}>
                <span className="tabular-nums shrink-0">{justAdvanced ? 'Next up' : `${queueIndex + 1}/${queue.length}`}</span>
                <span className="truncate opacity-90">{queue[queueIndex]?.title}</span>
              </div>
              <button
                onClick={nextInQueue}
                disabled={queueIndex >= queue.length - 1}
                aria-label="Next script"
                className="p-1.5 rounded-full bg-black/40 backdrop-blur border border-white/10 disabled:opacity-30"
              >
                <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
              </button>
            </div>
          )}
          <div
            ref={scrollerRef}
            onScroll={onScrollerScroll}
            onPointerDown={onScrollerPointerDown}
            onPointerUp={onScrollerPointerUp}
            className="flex-1 overflow-y-auto px-6 pointer-events-auto cursor-pointer select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overscroll-contain"
            style={{ marginTop: queue.length > 1 ? '8px' : belowTopBar, touchAction: 'pan-y' }}
            aria-label={playing ? 'Teleprompter scrolling — tap to pause, drag to scroll' : 'Teleprompter paused — tap to play, drag to scroll'}
          >
            <div
              className="text-white/95 font-semibold text-center whitespace-pre-wrap mx-auto max-w-md"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.5, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
            >
              {script}
            </div>
            {/* Trailing space so the last line can scroll up into reading
                position instead of dying pinned to the bottom edge. */}
            <div className="h-40" />
            {!playing && (
              <div className="sticky bottom-1 text-center text-[10px] text-zinc-300/80 pointer-events-none">
                tap to play · drag to scroll · auto-starts recording
              </div>
            )}
          </div>

          {/* Control row — flex-wrap so the full cluster (play, speed, size,
              reset, load, edit, hide) always fits on narrow phones instead of
              the rightmost icons running off-screen. */}
          <div className="pointer-events-auto px-3 pb-2 flex flex-wrap items-center justify-center gap-1.5">
            <button
              onClick={() => setPlaying(p => !p)}
              aria-label={playing ? 'Pause teleprompter' : 'Play teleprompter'}
              className={`p-2 rounded-full bg-black/40 backdrop-blur border transition-colors ${playing ? 'border-teal-400/70 text-teal-300' : 'border-white/10 text-white'}`}
            >
              {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            </button>
            {/* Speed — badge turns teal when off the 1.0x default so a custom
                setting is obvious at a glance. */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full backdrop-blur border ${speed !== 1 ? 'bg-teal-500/20 border-teal-400/60' : 'bg-black/40 border-white/10'}`}>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                aria-label="Teleprompter speed"
                className="w-20 accent-teal-400"
              />
              <span className={`text-[10px] font-semibold tabular-nums w-7 text-right ${speed !== 1 ? 'text-teal-200' : ''}`}>{speed.toFixed(1)}x</span>
            </div>
            {/* Text size — shows the actual px value between the A buttons, and
                tints teal when it's off the 22px default. */}
            <div className={`flex items-center rounded-full backdrop-blur border ${fontSize !== 22 ? 'bg-teal-500/20 border-teal-400/60' : 'bg-black/40 border-white/10'}`}>
              <button onClick={() => setFontSize(-2)} aria-label="Smaller text" className="px-2 py-1.5 text-xs font-bold text-white/90 hover:bg-white/10 rounded-l-full">A−</button>
              <span className={`text-[10px] font-semibold tabular-nums w-6 text-center ${fontSize !== 22 ? 'text-teal-200' : 'text-white/70'}`}>{fontSize}</span>
              <button onClick={() => setFontSize(2)} aria-label="Bigger text" className="px-2 py-1.5 text-sm font-bold text-white/90 hover:bg-white/10 rounded-r-full">A+</button>
            </div>
            {/* Reset appears only when something is customized — so the creator
                can both SEE a custom setting and clear it in one tap. */}
            {(speed !== 1 || fontSize !== 22) && (
              <button
                onClick={() => { setSpeed(1); setFontSize(22 - fontSizeRef.current); }}
                aria-label="Reset speed and text size"
                className="p-2 rounded-full bg-black/40 backdrop-blur border border-white/10 text-white/80 hover:bg-white/10"
                title="Reset speed + size"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={openPicker}
              aria-label="Load a saved script"
              className="p-2 rounded-full bg-black/40 backdrop-blur border border-white/10 text-white/90 hover:bg-white/10"
            >
              <ScrollText className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setDraft(script); setShowPaste(true); }}
              aria-label="Edit script"
              className="p-2 rounded-full bg-black/40 backdrop-blur border border-white/10 text-white/90 hover:bg-white/10"
            >
              <PenLine className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setOpen(false); setPlaying(false); }}
              aria-label="Hide teleprompter"
              className="p-2 rounded-full bg-black/40 backdrop-blur border border-white/10 text-white/90 hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Saved-script picker sheet — the in-studio path: tap a saved script to
          load it (no copy/paste). Same bg/blur language as the paste sheet.
          Handles loading / empty / logged-out / error, each falling back to a
          "paste your own" secondary action so the user is never stuck. */}
      {showPicker && (
        <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur flex items-end sm:items-center justify-center" onClick={() => setShowPicker(false)}>
          <div className="w-full max-w-md bg-zinc-950 border-t sm:border border-white/10 sm:rounded-2xl rounded-t-2xl p-5 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-base font-semibold flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-teal-300" /> Load a script
              </div>
              <button onClick={() => setShowPicker(false)} className="p-1.5 rounded-full hover:bg-white/10" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>

            {/* Loading */}
            {fetchState === 'loading' && (
              <div className="py-8 flex items-center justify-center text-sm text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading your scripts…
              </div>
            )}

            {/* Logged out — paste only + sign-in nudge. */}
            {fetchState === 'auth' && (
              <div className="py-2 text-sm text-zinc-400">
                <Link href="/login" className="text-teal-300 underline">Sign in</Link> to load your saved scripts.
              </div>
            )}

            {/* Error — honest message, retry, and the paste fallback below. */}
            {fetchState === 'error' && (
              <div className="py-2 text-sm text-zinc-400 flex items-center justify-between gap-2">
                <span>Couldn’t load your scripts.</span>
                <button onClick={fetchSavedScripts} className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Try again
                </button>
              </div>
            )}

            {/* Ready + empty — nudge to the generator, paste still available. */}
            {fetchState === 'ready' && savedScripts.length === 0 && (
              <div className="py-3 text-sm text-zinc-400">
                No saved scripts yet — make one in the{' '}
                <Link href="/script-generator" className="text-teal-300 underline">Script Generator</Link>.
              </div>
            )}

            {/* Ready + list — tap to add to a lineup (order number shows the
                sequence). One pick loads solo; multiple becomes a flow that
                auto-advances after each take. The currently-loaded script is
                marked so the user can tell what's already up. */}
            {fetchState === 'ready' && savedScripts.length > 0 && (
              <>
                <div className="text-[11px] text-zinc-400 mb-2">
                  Tap to build a lineup — record one, the next loads automatically.
                </div>
                <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5">
                  {savedScripts.map((s) => {
                    const order = pickIds.indexOf(s.id); // -1 if not picked
                    const picked = order >= 0;
                    const current = !picked && s.id === lastScriptId;
                    // First-line preview keeps the row short for long scripts.
                    const preview = s.text.split('\n')[0].slice(0, 80);
                    return (
                      <button
                        key={s.id}
                        onClick={() => togglePick(s.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors flex items-center gap-2.5 ${picked ? 'bg-teal-500/15 border-teal-400/60' : current ? 'bg-teal-500/10 border-teal-400/40' : 'bg-zinc-900 border-white/10 hover:bg-zinc-800'}`}
                      >
                        <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold border ${picked ? 'bg-teal-400 text-black border-teal-300' : 'border-white/20 text-white/40'}`}>
                          {picked ? order + 1 : ''}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium truncate flex-1">{s.title}</div>
                            {current && <span className="text-[10px] text-teal-300 shrink-0">on prompter</span>}
                          </div>
                          {preview && <div className="text-[11px] text-zinc-400 truncate mt-0.5">{preview}</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Primary action — load the pick(s). Label adapts to count. */}
            {pickIds.length > 0 && (
              <button
                onClick={confirmPicks}
                className="mt-3 w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-600 font-semibold flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                {pickIds.length === 1 ? 'Load script' : `Start lineup (${pickIds.length})`}
              </button>
            )}

            {/* Secondary path — paste your own, always available. */}
            <button
              onClick={() => { setShowPicker(false); setDraft(script || ''); setShowPaste(true); }}
              className="mt-2 w-full py-2.5 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 text-sm font-medium flex items-center justify-center gap-2"
            >
              <PenLine className="w-4 h-4" /> or paste your own
            </button>
          </div>
        </div>
      )}

      {/* Paste/edit sheet — for studio-first users with no script handed off. */}
      {showPaste && (
        <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur flex items-end sm:items-center justify-center" onClick={() => setShowPaste(false)}>
          <div className="w-full max-w-md bg-zinc-950 border-t sm:border border-white/10 sm:rounded-2xl rounded-t-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-base font-semibold flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-teal-300" /> Teleprompter script
              </div>
              <button onClick={() => setShowPaste(false)} className="p-1.5 rounded-full hover:bg-white/10" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste your script here — or write one on the Scripts tab and tap “Send to teleprompter”."
              rows={8}
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none resize-none"
            />
            <button
              onClick={savePasted}
              disabled={!draft.trim()}
              className="mt-3 w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:opacity-40 font-semibold"
            >
              Load onto teleprompter
            </button>
          </div>
        </div>
      )}
    </>
  );
}
