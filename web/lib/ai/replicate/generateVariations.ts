/**
 * Replication Engine — generates 5 content variations from a winning post.
 *
 * Uses postmortem insights, hook pattern, and product context to create
 * actionable content ideas that replicate the success formula.
 */

import { z } from 'zod';
import { callAnthropicJSON } from '@/lib/ai/anthropic';

// ─── Schema ──────────────────────────────────────────────────

const VariationSchema = z.object({
  title: z.string(),
  hook: z.string(),
  concept: z.string(),
  angle: z.string(),
  why_it_works: z.string(),
});

export const VariationsResultSchema = z.object({
  variations: z.array(VariationSchema).min(1).max(5),
});

export type ContentVariation = z.infer<typeof VariationSchema>;
export type VariationsResult = z.infer<typeof VariationsResultSchema>;

// ─── Input ───────────────────────────────────────────────────

export interface GenerateVariationsInput {
  platform: string;
  captionUsed: string | null;
  hookPattern: string | null;
  productName: string | null;
  postmortemSummary: string | null;
  whatWorked: string[];
  transcript: string | null;
  correlationId?: string;
}

// ─── Generator ───────────────────────────────────────────────

export async function generateVariations(
  input: GenerateVariationsInput,
): Promise<VariationsResult> {
  const contextParts: string[] = [];

  contextParts.push(`Platform: ${input.platform}`);

  if (input.captionUsed) {
    contextParts.push(`Caption used: ${input.captionUsed}`);
  }
  if (input.hookPattern) {
    contextParts.push(`Winning hook pattern: ${input.hookPattern}`);
  }
  if (input.productName) {
    contextParts.push(`Product: ${input.productName}`);
  }
  if (input.postmortemSummary) {
    contextParts.push(`Postmortem summary: ${input.postmortemSummary}`);
  }
  if (input.whatWorked.length > 0) {
    contextParts.push(`What worked:\n${input.whatWorked.map(w => `- ${w}`).join('\n')}`);
  }
  if (input.transcript) {
    const trimmed = input.transcript.slice(0, 1500);
    contextParts.push(`Transcript excerpt: ${trimmed}`);
  }

  const prompt = `You are a viral content strategist. Given a winning post's details, generate exactly 5 unique content variations that replicate the success formula while being fresh and different.

${contextParts.join('\n\n')}

For each variation provide:
- title: a short working title (5-10 words)
- hook: the opening hook line (the first thing viewers see/hear)
- concept: a 1-2 sentence description of the video concept
- angle: the unique angle or twist that differentiates this variation
- why_it_works: why this variation should perform well based on what worked before

Return JSON matching this exact schema:
{
  "variations": [
    { "title": "...", "hook": "...", "concept": "...", "angle": "...", "why_it_works": "..." }
  ]
}`;

  const { parsed } = await callAnthropicJSON<VariationsResult>(prompt, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 2000,
    temperature: 0.8,
    correlationId: input.correlationId,
    requestType: 'analysis',
    agentId: 'replication-engine',
  });

  const result = VariationsResultSchema.safeParse(parsed);
  if (result.success) return result.data;

  // Fallback: try to extract variations array from parsed
  const raw = parsed as Record<string, unknown>;
  if (Array.isArray(raw.variations)) {
    return {
      variations: (raw.variations as unknown[]).slice(0, 5).map((v) => {
        const item = v as Record<string, unknown>;
        return {
          title: String(item.title || 'Untitled'),
          hook: String(item.hook || ''),
          concept: String(item.concept || ''),
          angle: String(item.angle || ''),
          why_it_works: String(item.why_it_works || ''),
        };
      }),
    };
  }

  throw new Error('Failed to parse variations from AI response');
}
