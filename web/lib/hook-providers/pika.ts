/**
 * Pika hook provider — short stylized text-to-video clips.
 *
 * Status: STUB. Real integration pending — set PIKA_API_KEY in Vercel
 * to activate. https://pika.art/api (currently invite-only).
 *
 * API endpoints used (when wired):
 *   POST https://api.pika.art/v1/generate
 *     headers: { 'Authorization': `Bearer ${PIKA_API_KEY}`, 'Content-Type': 'application/json' }
 *     body: { prompt, aspectRatio, duration, motion, ... }
 *     -> { id, status: 'queued' }
 *
 *   GET https://api.pika.art/v1/generations/{id}
 *     -> { id, status, video?: { url } }
 */
import type {
  HookProvider,
  HookGenerateOptions,
  HookGenerateResult,
  HookPollResult,
  AspectRatio,
} from './types';

const PIKA_BASE = 'https://api.pika.art';

export const pikaProvider: HookProvider = {
  id: 'pika',
  name: 'Pika',
  costCredits: 30,
  supportedAspectRatios: ['9:16', '1:1', '16:9'] as AspectRatio[],
  supportedDurations: [3, 4],
  description: 'Fast, stylized 3–4s clips. Great for energetic hooks and B-roll punches.',

  async generate(_prompt: string, _opts: HookGenerateOptions): Promise<HookGenerateResult> {
    if (!process.env.PIKA_API_KEY) {
      throw new Error('pika integration pending — set PIKA_API_KEY env var');
    }
    void PIKA_BASE;
    throw new Error('pika integration pending — generate() not yet implemented');
  },

  async pollStatus(_jobId: string): Promise<HookPollResult> {
    if (!process.env.PIKA_API_KEY) {
      throw new Error('pika integration pending — set PIKA_API_KEY env var');
    }
    throw new Error('pika integration pending — pollStatus() not yet implemented');
  },
};
