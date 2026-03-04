/**
 * Viral Playbook Generator
 *
 * When a post is flagged as a viral alert (winner_candidate), generates
 * an actionable playbook: why it worked, follow-up ideas, comment
 * strategy, and remix variations.
 */

import { z } from 'zod';
import { callAnthropicJSON } from '@/lib/ai/anthropic';

// ─── Schema ──────────────────────────────────────────────────

export const PlaybookSchema = z.object({
  why_it_worked: z.string(),
  followup_ideas: z.array(z.string()).min(1).max(5),
  reply_comment_strategy: z.string(),
  remix_variations: z.array(z.string()).min(1).max(5),
});

export type ViralPlaybook = z.infer<typeof PlaybookSchema>;

// ─── Input ───────────────────────────────────────────────────

export interface GeneratePlaybookInput {
  postmortem: {
    summary: string;
    what_worked: string[];
    hook_analysis: { hook_strength: number; pattern_detected: string };
    engagement_analysis: { engagement_rate: number; comment_sentiment: string };
  };
  metrics: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
  };
  hookPattern: string | null;
  productName: string | null;
  correlationId?: string;
}

// ─── Prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a viral content strategist. A creator's post has been flagged as viral content. Generate an actionable playbook to capitalize on this momentum.

Return valid JSON matching this exact schema:
{
  "why_it_worked": "2-3 sentence analysis of the core reason this content resonated",
  "followup_ideas": ["3 specific follow-up video ideas that ride the momentum"],
  "reply_comment_strategy": "Specific strategy for engaging with comments to boost algorithmic distribution",
  "remix_variations": ["3 ways to remix/repurpose this exact content for more reach"]
}`;

function buildPrompt(input: GeneratePlaybookInput): string {
  const parts: string[] = [];

  parts.push(`POSTMORTEM SUMMARY:\n${input.postmortem.summary}`);
  parts.push(`WHAT WORKED:\n${input.postmortem.what_worked.map(w => `- ${w}`).join('\n')}`);
  parts.push(`HOOK: "${input.postmortem.hook_analysis.pattern_detected}" (strength: ${input.postmortem.hook_analysis.hook_strength}/10)`);
  parts.push(`ENGAGEMENT: ${input.postmortem.engagement_analysis.engagement_rate.toFixed(1)}% rate, ${input.postmortem.engagement_analysis.comment_sentiment} sentiment`);

  const m = input.metrics;
  const metricParts: string[] = [];
  if (m.views != null) metricParts.push(`${m.views} views`);
  if (m.likes != null) metricParts.push(`${m.likes} likes`);
  if (m.comments != null) metricParts.push(`${m.comments} comments`);
  if (m.shares != null) metricParts.push(`${m.shares} shares`);
  if (m.saves != null) metricParts.push(`${m.saves} saves`);
  if (metricParts.length > 0) parts.push(`METRICS: ${metricParts.join(', ')}`);

  if (input.hookPattern) parts.push(`HOOK PATTERN: ${input.hookPattern}`);
  if (input.productName) parts.push(`PRODUCT FEATURED: ${input.productName}`);

  return parts.join('\n\n') + '\n\nGenerate the viral playbook as JSON.';
}

// ─── Generate ────────────────────────────────────────────────

export async function generatePlaybook(input: GeneratePlaybookInput): Promise<ViralPlaybook> {
  const { parsed } = await callAnthropicJSON<ViralPlaybook>(
    buildPrompt(input),
    {
      systemPrompt: SYSTEM_PROMPT,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 1024,
      temperature: 0.5,
      correlationId: input.correlationId,
      requestType: 'viral-playbook',
      agentId: 'viral-playbook-engine',
    },
  );

  const result = PlaybookSchema.safeParse(parsed);
  if (!result.success) {
    // Fallback: coerce shape
    const raw = parsed as Record<string, unknown>;
    return {
      why_it_worked: String(raw.why_it_worked || ''),
      followup_ideas: Array.isArray(raw.followup_ideas)
        ? (raw.followup_ideas as unknown[]).map(String).slice(0, 5)
        : Array.isArray(raw['3_followup_ideas'])
          ? (raw['3_followup_ideas'] as unknown[]).map(String).slice(0, 5)
          : [],
      reply_comment_strategy: String(raw.reply_comment_strategy || ''),
      remix_variations: Array.isArray(raw.remix_variations)
        ? (raw.remix_variations as unknown[]).map(String).slice(0, 5)
        : [],
    };
  }

  return result.data;
}
