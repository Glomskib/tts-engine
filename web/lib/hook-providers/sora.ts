/**
 * Sora hook provider — OpenAI text-to-video.
 *
 * Status: STUB. Real integration pending — set SORA_API_KEY in Vercel
 * to activate. (Sora API access is gated; FlashFlow needs allowlist approval.)
 *
 * API endpoints used (when wired):
 *   POST https://api.openai.com/v1/videos/generations
 *     headers: { 'Authorization': `Bearer ${SORA_API_KEY}`, 'Content-Type': 'application/json' }
 *     body: { model: 'sora-1.0', prompt, size: '1080x1920', duration: 5 }
 *     -> { id, status: 'queued' }
 *
 *   GET https://api.openai.com/v1/videos/generations/{id}
 *     -> { id, status, output: { video_url? }, error? }
 */
import type {
  HookProvider,
  HookGenerateOptions,
  HookGenerateResult,
  HookPollResult,
  AspectRatio,
} from './types';

const SORA_BASE = 'https://api.openai.com';

export const soraProvider: HookProvider = {
  id: 'sora',
  name: 'Sora',
  costCredits: 100,
  supportedAspectRatios: ['9:16', '1:1', '16:9'] as AspectRatio[],
  supportedDurations: [5, 10],
  description: 'OpenAI Sora text-to-video. Highest quality for cinematic, realistic hook footage.',

  async generate(_prompt: string, _opts: HookGenerateOptions): Promise<HookGenerateResult> {
    if (!process.env.SORA_API_KEY) {
      throw new Error('sora integration pending — set SORA_API_KEY env var');
    }
    void SORA_BASE;
    throw new Error('sora integration pending — generate() not yet implemented');
  },

  async pollStatus(_jobId: string): Promise<HookPollResult> {
    if (!process.env.SORA_API_KEY) {
      throw new Error('sora integration pending — set SORA_API_KEY env var');
    }
    throw new Error('sora integration pending — pollStatus() not yet implemented');
  },
};
