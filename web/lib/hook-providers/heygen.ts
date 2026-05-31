/**
 * Heygen hook provider — AI avatar text-to-video.
 *
 * Implements the {@link HookProvider} contract by calling the HeyGen v2 API.
 * Wired up during the 2026-05-27 audit — was previously a stub that threw
 * "not yet implemented" for both generate() and pollStatus().
 *
 * API endpoints used:
 *   POST https://api.heygen.com/v2/video/generate
 *     -> { data: { video_id } }
 *
 *   GET https://api.heygen.com/v1/video_status.get?video_id={id}
 *     -> { data: { status: 'pending'|'processing'|'completed'|'failed',
 *                  video_url?, thumbnail_url?, error? } }
 *
 * For requests originating from the Hook Generator UI we use a generic default
 * talking-head avatar. The avatars/[id]/render/test route in /api uses a
 * user-specific avatar id directly and bypasses this provider — keep those
 * paths separate.
 */
import type {
  HookProvider,
  HookGenerateOptions,
  HookGenerateResult,
  HookPollResult,
  AspectRatio,
} from './types';

const HEYGEN_BASE = 'https://api.heygen.com';

// HeyGen sample stock avatar — Anna in office (free). Override per-call by
// passing opts.avatarId. Reference: https://docs.heygen.com/reference/list-avatars
const DEFAULT_AVATAR_ID = 'Daisy-inskirt-20220818';
// HeyGen default English voice (matches the public docs quick-start).
const DEFAULT_VOICE_ID = '2d5b0e6cf36f460aa7fc47e3eee4ba54';

function dimensionFor(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16': return { width: 720, height: 1280 };
    case '16:9': return { width: 1280, height: 720 };
    case '1:1':  return { width: 1080, height: 1080 };
  }
}

/** Map HeyGen's status strings to our shared enum. */
function mapStatus(s: string | undefined): HookPollResult['status'] {
  switch (s) {
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'processing': return 'processing';
    case 'pending':
    case 'waiting':
    default:
      return 'queued';
  }
}

export const heygenProvider: HookProvider = {
  id: 'heygen',
  name: 'Heygen Avatar',
  costCredits: 50,
  supportedAspectRatios: ['9:16', '1:1', '16:9'] as AspectRatio[],
  supportedDurations: [5, 10, 15],
  description: 'Photorealistic AI avatar reads your hook script. Best for talking-head openings.',

  async generate(prompt: string, opts: HookGenerateOptions): Promise<HookGenerateResult> {
    const apiKey = process.env.HEYGEN_API_KEY;
    if (!apiKey) {
      throw new Error('heygen integration pending — set HEYGEN_API_KEY env var');
    }

    const dim = dimensionFor(opts.aspectRatio);
    const body = {
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: opts.avatarId || DEFAULT_AVATAR_ID,
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            input_text: prompt.slice(0, 1500),
            voice_id: opts.voiceId || DEFAULT_VOICE_ID,
          },
        },
      ],
      dimension: dim,
      // We rely on the polling endpoint to detect completion; HeyGen returns
      // video_id synchronously.
    } as const;

    const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`heygen generate ${res.status}: ${errText.slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      data?: { video_id?: string };
      error?: { message?: string };
    };

    const videoId = json.data?.video_id;
    if (!videoId) {
      throw new Error(`heygen generate: missing video_id (${json.error?.message ?? 'unknown error'})`);
    }

    // HeyGen talking-head jobs are typically ~30–60s. Estimate is best-effort;
    // the UI uses it for a countdown only.
    return {
      jobId: videoId,
      status: 'queued',
      estimatedSec: Math.max(30, opts.durationSec * 6),
    };
  },

  async pollStatus(jobId: string): Promise<HookPollResult> {
    const apiKey = process.env.HEYGEN_API_KEY;
    if (!apiKey) {
      throw new Error('heygen integration pending — set HEYGEN_API_KEY env var');
    }

    const res = await fetch(
      `${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(jobId)}`,
      { headers: { 'X-Api-Key': apiKey } },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`heygen pollStatus ${res.status}: ${errText.slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      data?: {
        status?: string;
        video_url?: string;
        thumbnail_url?: string;
        error?: { message?: string };
      };
    };

    const status = mapStatus(json.data?.status);
    const result: HookPollResult = { status };
    if (status === 'completed' && json.data?.video_url) {
      result.videoUrl = json.data.video_url;
      result.progress = 1;
    }
    if (status === 'failed') {
      result.errorMessage = json.data?.error?.message || 'Avatar render failed upstream.';
    }
    if (status === 'processing') {
      // HeyGen doesn't expose progress; bisect-style estimate so the UI moves.
      result.progress = 0.5;
    }
    return result;
  },
};
