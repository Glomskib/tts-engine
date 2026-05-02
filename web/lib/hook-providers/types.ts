/**
 * Hook video provider interface.
 *
 * FlashFlow's Hook Generator (Phase 1.2) supports multiple text-to-video
 * providers — Heygen avatars, Sora, Pika, Runway Gen-3, Luma. Each provider
 * implements `HookProvider` so the API layer is uniform from the FE's POV:
 *
 *   debit credits → call generate() → poll pollStatus() until done → store URL
 *
 * Provider implementations live in `lib/hook-providers/{provider}.ts` and are
 * registered in `lib/hook-providers/registry.ts`. A provider stub throws
 * "integration pending" until its API key is set in Vercel.
 *
 * Pricing (credits = $0.10 retail):
 *   - Heygen avatar (5–15s):  50 credits
 *   - Sora text-to-video:    100 credits
 *   - Pika (3–4s):            30 credits
 *   - Runway Gen-3 (5s):      75 credits
 *   - Luma Dream Machine:     60 credits
 */

export type AspectRatio = '9:16' | '1:1' | '16:9';

export type HookGenStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface HookProviderId {
  id: 'heygen' | 'sora' | 'pika' | 'runway' | 'luma';
}

export interface HookGenerateOptions {
  /** Target aspect ratio. Provider may reject if unsupported. */
  aspectRatio: AspectRatio;
  /** Target duration in seconds. Provider may clamp. */
  durationSec: number;
  /** Optional negative prompt (excluded styles, etc.) */
  negativePrompt?: string;
  /** Optional reference image URL (for image-to-video providers) */
  referenceImageUrl?: string;
  /** Optional avatar / voice ID for providers like Heygen */
  avatarId?: string;
  voiceId?: string;
  /** Caller-supplied correlation ID for log linking */
  correlationId?: string;
}

export interface HookGenerateResult {
  /** Provider-side job ID — opaque to FlashFlow */
  jobId: string;
  /** Always 'queued' on success — caller polls for completion */
  status: 'queued';
  /** Best-effort estimate so we can show a countdown. May be wrong. */
  estimatedSec: number;
}

export interface HookPollResult {
  status: HookGenStatus;
  /** Public URL to the rendered video. Present iff status === 'completed'. */
  videoUrl?: string;
  /** Human-readable error. Present iff status === 'failed'. */
  errorMessage?: string;
  /** Optional progress 0..1 for UI */
  progress?: number;
}

export interface HookProvider {
  /** Stable string identifier — used as the URL/DB key */
  id: HookProviderId['id'];
  /** Display name for the picker UI */
  name: string;
  /** Credit cost for one generation */
  costCredits: number;
  /** Aspect ratios the provider can render */
  supportedAspectRatios: AspectRatio[];
  /** Duration options (seconds) the provider supports */
  supportedDurations: number[];
  /** Short blurb shown in the picker UI */
  description: string;

  /**
   * Submit a generation request. Returns a provider-side job ID immediately —
   * the caller should poll pollStatus() to detect completion.
   *
   * Stub implementations throw `Error("<provider> integration pending — set
   * <PROVIDER>_API_KEY env var")` so the UI can detect missing-key state.
   */
  generate(prompt: string, opts: HookGenerateOptions): Promise<HookGenerateResult>;

  /** Poll the provider for the current state of a generation job. */
  pollStatus(jobId: string): Promise<HookPollResult>;
}
