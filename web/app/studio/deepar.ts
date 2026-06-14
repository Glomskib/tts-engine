/**
 * DeepAR AR-filter layer for /studio — OPTIONAL, lazy-loaded.
 *
 * Why this file exists separately from page.tsx:
 *   - The `deepar` npm package pulls a multi-MB WASM blob. We never want that
 *     on the Studio page unless the user actually picks an AR filter, so every
 *     import here is dynamic (`await import('deepar')`) and only fires the first
 *     time a non-'none' filter is selected. With AR off, page.tsx behaves
 *     EXACTLY as before — none of this code runs.
 *
 * What it does:
 *   - initialize DeepAR against an offscreen <canvas> we own,
 *   - feed it the SAME MediaStream getUserMedia handed page.tsx (so the mic
 *     picker, zoom, facingMode etc. are still page.tsx's job),
 *   - load/switch/clear `.deepar` effect files hosted under /public/deepar,
 *   - expose DeepAR's render canvas so page.tsx can (a) show it as the live
 *     preview and (b) record it via canvas.captureStream() — baking the filter
 *     into the file (WYSIWYG), exactly like the existing CSS-beauty canvas path.
 *
 * SDK: deepar@^5.6.22 (DeepAR Web v5 API — deepar.initialize(...),
 * setVideoElement(), switchEffect(url,{slot}), getCanvas()). Confirmed against
 * https://docs.deepar.ai/deepar-sdk/deep-ar-sdk-for-web/api-reference (v5.6.22).
 */

// The DeepAR class is heavy; we only ever reference its TYPE here, never import
// it eagerly. `unknown`-ish minimal shape keeps page.tsx + tsc happy without
// forcing the package to be resolvable at build time of THIS module's consumers.
type DeepARInstance = {
  setVideoElement: (video: HTMLVideoElement, mirror: boolean) => void;
  switchEffect: (effect: string, opts?: { slot?: string }) => Promise<void>;
  clearEffect: (slot?: string) => void;
  getCanvas: () => HTMLCanvasElement;
  setPaused: (paused: boolean) => void;
  shutdown: () => void;
  callbacks: Record<string, unknown>;
};

export interface ArEffect {
  id: string;        // pref value persisted in localStorage
  label: string;     // pill label on the record screen
  hint: string;      // short description (settings / a11y)
  /** Path under /public, or '' for the 'none' sentinel. */
  file: string;
}

/**
 * The filter row. 'none' is the sentinel that keeps the legacy pipeline.
 * Files live in web/public/deepar/effects (see that folder). Order = pill order.
 * 'beauty' (MakeupLook) is first after None — it's the tasteful skin/makeup
 * look most creators want; the rest are fun "looks".
 */
export const AR_EFFECTS: ArEffect[] = [
  { id: 'none',    label: 'None',   hint: 'No AR filter',                file: '' },
  { id: 'beauty',  label: 'Beauty', hint: 'Smooth skin + soft makeup',   file: '/deepar/effects/MakeupLook.deepar' },
  { id: 'split',   label: 'Glow',   hint: 'Split-view beauty look',      file: '/deepar/effects/Split_View_Look.deepar' },
  { id: 'galaxy',  label: 'Galaxy', hint: 'Galaxy background',           file: '/deepar/effects/galaxy_background_web.deepar' },
  { id: 'hearts',  label: 'Hearts', hint: 'Pixel hearts',                file: '/deepar/effects/Pixel_Hearts.deepar' },
  { id: 'devil',   label: 'Devil',  hint: 'Neon devil horns',            file: '/deepar/effects/Neon_Devil_Horns.deepar' },
  { id: 'viking',  label: 'Viking', hint: 'Viking helmet',               file: '/deepar/effects/viking_helmet.deepar' },
];

export const AR_EFFECT_BY_ID: Record<string, ArEffect> =
  Object.fromEntries(AR_EFFECTS.map(e => [e.id, e]));

// DeepAR WEB license key for the flashflowai.com domain. DeepAR web keys are
// domain-LOCKED and ship in client JS by design (not a secret), so embedding it
// is safe and avoids depending on a build-time env var being set to the exact
// right value (a mismatched env-var key was the "license not valid" bug on
// 2026-06-14). The env var, if set, still overrides — but the hardcoded key is
// the source of truth. Rotate in the DeepAR console + update here when needed.
const DEEPAR_WEB_KEY = 'e112b3a593fea41bae429217d8bc9120caf30a96f4141bda1a38bd82f6249f2b995f724fdf577d67';

/** The active web license key — hardcoded flashflowai.com key wins; env var is
 *  an optional override for other domains/deployments. */
export function deeparWebKey(): string {
  return DEEPAR_WEB_KEY || (process.env.NEXT_PUBLIC_DEEPAR_WEB_KEY ?? '');
}

/** Is the AR feature even available? No license key → hide the whole row. */
export function arEnabled(): boolean {
  return !!deeparWebKey();
}

const SLOT = 'studio';

/**
 * Thin stateful controller around one DeepAR instance. Created lazily by
 * page.tsx the first time an AR filter is picked. Safe to construct once and
 * reuse across effect switches; call destroy() on unmount / when AR turns off.
 */
export class ArController {
  private deepar: DeepARInstance | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private initializing: Promise<void> | null = null;
  private currentEffectId = 'none';
  private destroyed = false;

  /**
   * Boot DeepAR against a fresh offscreen canvas and feed it `video` as the
   * camera source. Idempotent: repeated calls reuse the same instance, and
   * just re-point the video element (used after a camera flip / lens swap that
   * replaces the stream). Throws if the SDK fails to load or the key is bad —
   * page.tsx catches and falls back to the legacy pipeline.
   */
  async init(video: HTMLVideoElement): Promise<void> {
    if (this.destroyed) throw new Error('ArController destroyed');
    if (this.deepar) { this.setVideo(video); return; }
    if (this.initializing) { await this.initializing; this.setVideo(video); return; }

    const licenseKey = deeparWebKey();
    if (!licenseKey) throw new Error('DeepAR web license key missing');

    this.initializing = (async () => {
      // Dynamic import — THIS is the line that pulls the heavy WASM, and only
      // when a filter is first selected.
      const deepar = await import('deepar');

      // Our own canvas: DeepAR renders here; page.tsx mirrors it into the
      // preview and records its captureStream. Sized to portrait 9:16 to match
      // the studio's recording target; DeepAR fits any input to canvas size.
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 1280;
      this.canvas = canvas;

      // disableDefaultCamera: we supply the stream via setVideoElement, so
      // DeepAR must NOT open its own getUserMedia (that would fight page.tsx's
      // mic/lens selection and double-prompt for permission).
      const instance = (await deepar.initialize({
        licenseKey,
        canvas,
        additionalOptions: {
          cameraConfig: { disableDefaultCamera: true },
        },
      })) as unknown as DeepARInstance;

      if (this.destroyed) { try { instance.shutdown(); } catch {} return; }
      this.deepar = instance;
      this.setVideo(video);
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  /**
   * Re-point DeepAR at a (possibly new) camera video element. mirror=false:
   * like the rest of /studio, the front-camera mirror is a PREVIEW-only CSS
   * transform applied by page.tsx — the recorded pixels stay unflipped to match
   * the /create convention, so DeepAR must not mirror internally.
   */
  setVideo(video: HTMLVideoElement) {
    if (!this.deepar) return;
    try { this.deepar.setVideoElement(video, false); } catch {}
  }

  /**
   * Load/switch/clear the active effect. 'none' clears the slot (DeepAR then
   * just passes the camera through untouched — still a valid preview/record
   * surface). Returns the id actually applied so callers can reconcile state.
   */
  async switchTo(effectId: string): Promise<void> {
    if (!this.deepar) return;
    const effect = AR_EFFECT_BY_ID[effectId];
    this.currentEffectId = effect ? effect.id : 'none';
    if (!effect || !effect.file) {
      try { this.deepar.clearEffect(SLOT); } catch {}
      return;
    }
    await this.deepar.switchEffect(effect.file, { slot: SLOT });
  }

  /** DeepAR's live render canvas — the preview + recording source. */
  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  /** captureStream off DeepAR's canvas, for MediaRecorder. */
  captureStream(fps = 30): MediaStream | null {
    const c = this.canvas;
    if (!c || typeof c.captureStream !== 'function') return null;
    return c.captureStream(fps);
  }

  get effectId() { return this.currentEffectId; }
  get ready() { return !!this.deepar; }

  pause(p: boolean) { try { this.deepar?.setPaused(p); } catch {} }

  destroy() {
    this.destroyed = true;
    try { this.deepar?.shutdown(); } catch {}
    this.deepar = null;
    this.canvas = null;
  }
}
