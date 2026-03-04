/**
 * Experiment Generator
 *
 * Takes winning hooks and generates 3 variations using Claude.
 */

import { callAnthropicAPI } from '@/lib/ai/anthropic';

export interface HookVariation {
  hook: string;
  variation_1: string;
  variation_2: string;
  variation_3: string;
}

export async function generateExperiments(
  hooks: string[],
  correlationId?: string,
): Promise<HookVariation[]> {
  if (hooks.length === 0) return [];

  const hooksText = hooks.map((h, i) => `${i + 1}. "${h}"`).join('\n');

  const result = await callAnthropicAPI(
    `Generate 3 TikTok hook variations for each of these hooks. Keep the core idea but change the context, delivery, or angle.\n\nHooks:\n${hooksText}\n\nReturn ONLY a JSON array in this exact format (no markdown, no code fences):\n[{"hook":"original hook","variation_1":"...","variation_2":"...","variation_3":"..."}]`,
    {
      systemPrompt: 'You are a TikTok content strategist. You generate engaging hook variations that stop the scroll. Return only valid JSON.',
      maxTokens: 2048,
      temperature: 0.8,
      correlationId,
      requestType: 'generation',
      agentId: 'experiment-generator',
    },
  );

  try {
    const parsed = JSON.parse(result.text.trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
