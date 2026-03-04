/**
 * AI Idea Generator
 *
 * Generates 10 video ideas from hook patterns, winners, and recent postmortems.
 */

import { z } from 'zod';
import { callAnthropicJSON } from '@/lib/ai/anthropic';

// ─── Schema ──────────────────────────────────────────────────

export const IdeaSchema = z.object({
  title: z.string(),
  hook: z.string(),
  angle: z.string(),
  product_opportunity: z.string().nullable(),
  estimated_difficulty: z.enum(['easy', 'medium', 'hard']),
});

export const IdeasResponseSchema = z.object({
  ideas: z.array(IdeaSchema).min(1).max(10),
});

export type Idea = z.infer<typeof IdeaSchema>;
export type IdeasResponse = z.infer<typeof IdeasResponseSchema>;

// ─── Input ───────────────────────────────────────────────────

export interface GenerateIdeasInput {
  hookPatterns: Array<{ pattern: string; example_hook: string | null; performance_score: number }>;
  winners: Array<{ hook: string | null; performance_score: number | null; view_count: number | null }>;
  postmortems: Array<{ summary: string; what_worked: string[]; hook_pattern: string | null }>;
  brands: Array<{ name: string; target_audience: string | null }>;
  products: Array<{ name: string; category: string | null }>;
  correlationId?: string;
}

// ─── Prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a viral content strategist. Generate exactly 10 video ideas based on the creator's performance data.

Each idea must include:
- title: A specific, compelling video title
- hook: The exact opening line (first 3 seconds)
- angle: The creative angle or approach (1-2 sentences)
- product_opportunity: Which product to feature (or null if none fits)
- estimated_difficulty: "easy" (phone only, < 5 min), "medium" (some setup, 15-30 min), "hard" (production, editing, props)

Return valid JSON matching this schema:
{ "ideas": [{ "title", "hook", "angle", "product_opportunity", "estimated_difficulty" }] }

Prioritize ideas that:
1. Use hook patterns proven to perform well
2. Build on what worked in recent postmortems
3. Feature products that need content
4. Mix difficulty levels (mostly easy/medium)`;

function buildPrompt(input: GenerateIdeasInput): string {
  const parts: string[] = [];

  if (input.hookPatterns.length > 0) {
    const hooks = input.hookPatterns
      .map(h => `- "${h.pattern}" (score: ${h.performance_score}/10${h.example_hook ? `, e.g. "${h.example_hook}"` : ''})`)
      .join('\n');
    parts.push(`TOP HOOK PATTERNS:\n${hooks}`);
  }

  if (input.winners.length > 0) {
    const winners = input.winners
      .filter(w => w.hook)
      .map(w => `- "${w.hook}" (score: ${w.performance_score ?? '?'}/10, ${w.view_count ? `${(w.view_count / 1000).toFixed(1)}K views` : 'no view data'})`)
      .join('\n');
    if (winners) parts.push(`WINNING HOOKS:\n${winners}`);
  }

  if (input.postmortems.length > 0) {
    const pms = input.postmortems
      .map(p => {
        const worked = p.what_worked.length > 0 ? ` What worked: ${p.what_worked.join(', ')}` : '';
        return `- ${p.summary}${worked}`;
      })
      .join('\n');
    parts.push(`RECENT POSTMORTEMS:\n${pms}`);
  }

  if (input.brands.length > 0) {
    const brands = input.brands
      .map(b => `- ${b.name}${b.target_audience ? ` (audience: ${b.target_audience})` : ''}`)
      .join('\n');
    parts.push(`BRANDS:\n${brands}`);
  }

  if (input.products.length > 0) {
    const products = input.products
      .map(p => `- ${p.name}${p.category ? ` [${p.category}]` : ''}`)
      .join('\n');
    parts.push(`PRODUCTS:\n${products}`);
  }

  if (parts.length === 0) {
    parts.push('No historical data available. Generate general viral content ideas for a short-form video creator.');
  }

  return parts.join('\n\n') + '\n\nGenerate 10 video ideas as JSON.';
}

// ─── Generate ────────────────────────────────────────────────

export async function generateIdeas(input: GenerateIdeasInput): Promise<Idea[]> {
  const { parsed } = await callAnthropicJSON<IdeasResponse>(
    buildPrompt(input),
    {
      systemPrompt: SYSTEM_PROMPT,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 2048,
      temperature: 0.7,
      correlationId: input.correlationId,
      requestType: 'idea-generation',
      agentId: 'idea-generator',
    },
  );

  const result = IdeasResponseSchema.safeParse(parsed);
  if (!result.success) {
    // Fallback: try to extract ideas array directly
    if (parsed && Array.isArray((parsed as any).ideas)) {
      return (parsed as any).ideas.slice(0, 10).map((idea: any) => ({
        title: String(idea.title || 'Untitled Idea'),
        hook: String(idea.hook || ''),
        angle: String(idea.angle || ''),
        product_opportunity: idea.product_opportunity || null,
        estimated_difficulty: ['easy', 'medium', 'hard'].includes(idea.estimated_difficulty)
          ? idea.estimated_difficulty
          : 'medium',
      }));
    }
    throw new Error('AI returned invalid ideas format');
  }

  return result.data.ideas;
}
