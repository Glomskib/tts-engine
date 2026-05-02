/**
 * Runway hook provider — Gen-3 Alpha text-to-video.
 *
 * Status: STUB. Real integration pending — set RUNWAY_API_KEY in Vercel
 * to activate. https://docs.dev.runwayml.com/
 *
 * API endpoints used (when wired):
 *   POST https://api.dev.runwayml.com/v1/image_to_video
 *     headers: { 'Authorization': `Bearer ${RUNWAY_API_KEY}`, 'X-Runway-Version': '2024-11-06', 'Content-Type': 'application/json' }
 *     body: { promptImage, promptText, model: 'gen3a_turbo', ratio: '768:1280', duration: 5 }
 *     -> { id }
 *
 *   GET https://api.dev.runwayml.com/v1/tasks/{id}
 *     -> { id, status: 'PENDING'|'RUNNING'|'SUCCEEDED'|'FAILED', output?: [url], failure? }
 */
import type {
  HookProvider,
  HookGenerateOptions,
  HookGenerateResult,
  HookPollResult,
  AspectRatio,
} from './types';

const RUNWAY_BASE = 'https://api.dev.runwayml.com';

export const runwayProvider: HookProvider = {
  id: 'runway',
  name: 'Runway Gen-3',
  costCredits: 75,
  supportedAspectRatios: ['9:16', '16:9'] as AspectRatio[],
  supportedDurations: [5, 10],
  description: 'Runway Gen-3 Alpha — cinematic motion and detailed scenes from a prompt or image.',

  async generate(_prompt: string, _opts: HookGenerateOptions): Promise<HookGenerateResult> {
    if (!process.env.RUNWAY_API_KEY) {
      throw new Error('runway integration pending — set RUNWAY_API_KEY env var');
    }
    void RUNWAY_BASE;
    throw new Error('runway integration pending — generate() not yet implemented');
  },

  async pollStatus(_jobId: string): Promise<HookPollResult> {
    if (!process.env.RUNWAY_API_KEY) {
      throw new Error('runway integration pending — set RUNWAY_API_KEY env var');
    }
    throw new Error('runway integration pending — pollStatus() not yet implemented');
  },
};
