/**
 * Heygen hook provider — AI avatar text-to-video.
 *
 * Status: STUB. Real integration pending — set HEYGEN_API_KEY in Vercel
 * to activate. See https://docs.heygen.com/reference/quick-start
 *
 * API endpoints used (when wired):
 *   POST https://api.heygen.com/v2/video/generate
 *     headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' }
 *     body: { video_inputs: [{ character: { type: 'avatar', avatar_id }, voice: { type: 'text', input_text, voice_id } }], dimension: { width, height } }
 *     -> { data: { video_id } }
 *
 *   GET https://api.heygen.com/v1/video_status.get?video_id={id}
 *     headers: { 'X-Api-Key': HEYGEN_API_KEY }
 *     -> { data: { status: 'pending'|'processing'|'completed'|'failed', video_url?, error? } }
 */
import type {
  HookProvider,
  HookGenerateOptions,
  HookGenerateResult,
  HookPollResult,
  AspectRatio,
} from './types';

const HEYGEN_BASE = 'https://api.heygen.com';

export const heygenProvider: HookProvider = {
  id: 'heygen',
  name: 'Heygen Avatar',
  costCredits: 50,
  supportedAspectRatios: ['9:16', '1:1', '16:9'] as AspectRatio[],
  supportedDurations: [5, 10, 15],
  description: 'Photorealistic AI avatar reads your hook script. Best for talking-head openings.',

  async generate(_prompt: string, _opts: HookGenerateOptions): Promise<HookGenerateResult> {
    if (!process.env.HEYGEN_API_KEY) {
      throw new Error('heygen integration pending — set HEYGEN_API_KEY env var');
    }
    // TODO(phase 1.2a): wire POST ${HEYGEN_BASE}/v2/video/generate, return { data.video_id }
    void HEYGEN_BASE;
    throw new Error('heygen integration pending — generate() not yet implemented');
  },

  async pollStatus(_jobId: string): Promise<HookPollResult> {
    if (!process.env.HEYGEN_API_KEY) {
      throw new Error('heygen integration pending — set HEYGEN_API_KEY env var');
    }
    // TODO(phase 1.2a): GET ${HEYGEN_BASE}/v1/video_status.get?video_id=${jobId}
    throw new Error('heygen integration pending — pollStatus() not yet implemented');
  },
};
