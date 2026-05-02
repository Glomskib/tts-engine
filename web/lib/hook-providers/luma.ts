/**
 * Luma Dream Machine hook provider.
 *
 * Status: STUB. Real integration pending — set LUMA_API_KEY in Vercel
 * to activate. https://docs.lumalabs.ai/docs/api
 *
 * API endpoints used (when wired):
 *   POST https://api.lumalabs.ai/dream-machine/v1/generations
 *     headers: { 'Authorization': `Bearer ${LUMA_API_KEY}`, 'Content-Type': 'application/json' }
 *     body: { prompt, aspect_ratio: '9:16', loop: false }
 *     -> { id, state: 'queued' }
 *
 *   GET https://api.lumalabs.ai/dream-machine/v1/generations/{id}
 *     -> { id, state: 'queued'|'dreaming'|'completed'|'failed', assets?: { video } }
 */
import type {
  HookProvider,
  HookGenerateOptions,
  HookGenerateResult,
  HookPollResult,
  AspectRatio,
} from './types';

const LUMA_BASE = 'https://api.lumalabs.ai';

export const lumaProvider: HookProvider = {
  id: 'luma',
  name: 'Luma Dream Machine',
  costCredits: 60,
  supportedAspectRatios: ['9:16', '1:1', '16:9'] as AspectRatio[],
  supportedDurations: [5],
  description: 'Smooth motion and dreamy transitions. Strong middle-ground between Pika and Runway.',

  async generate(_prompt: string, _opts: HookGenerateOptions): Promise<HookGenerateResult> {
    if (!process.env.LUMA_API_KEY) {
      throw new Error('luma integration pending — set LUMA_API_KEY env var');
    }
    void LUMA_BASE;
    throw new Error('luma integration pending — generate() not yet implemented');
  },

  async pollStatus(_jobId: string): Promise<HookPollResult> {
    if (!process.env.LUMA_API_KEY) {
      throw new Error('luma integration pending — set LUMA_API_KEY env var');
    }
    throw new Error('luma integration pending — pollStatus() not yet implemented');
  },
};
