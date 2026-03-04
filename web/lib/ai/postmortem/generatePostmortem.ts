/**
 * AI Postmortem Engine — analyzes post performance using brief, transcript,
 * editor notes, and metrics to generate structured insights.
 *
 * Called via the API route after a post has metrics data.
 */

import { callAnthropicJSON } from '@/lib/ai/anthropic';
import { z } from 'zod';

// ─── Schema ───────────────────────────────────────────────

const HookAnalysisSchema = z.object({
  hook_strength: z.number().min(0).max(10),
  pattern_detected: z.string(),
  scroll_stop_rating: z.number().min(0).max(10),
  improvement: z.string(),
});

const EngagementAnalysisSchema = z.object({
  engagement_rate: z.number().min(0),
  comment_sentiment: z.enum(['positive', 'neutral', 'mixed', 'negative']),
  share_driver: z.string(),
  save_driver: z.string(),
});

export const PostmortemJSONSchema = z.object({
  summary: z.string(),
  what_worked: z.array(z.string()).min(1),
  what_failed: z.array(z.string()),
  hook_analysis: HookAnalysisSchema,
  engagement_analysis: EngagementAnalysisSchema,
  next_ideas: z.array(z.string()).min(1),
  winner_candidate: z.boolean(),
});

export type PostmortemJSON = z.infer<typeof PostmortemJSONSchema>;

export function safeValidatePostmortem(raw: unknown): {
  ok: boolean;
  data?: PostmortemJSON;
  error?: string;
} {
  const result = PostmortemJSONSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}

// ─── Input / Output ───────────────────────────────────────

export interface PostmortemInput {
  /** The platform where the post was published */
  platform: string;
  /** Post URL for reference */
  postUrl: string;
  /** Metrics snapshot */
  metrics: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    avg_watch_time_seconds: number | null;
    completion_rate: number | null;
  };
  /** Brief context (optional — may not have one) */
  briefSummary?: string | null;
  /** Transcript text (optional) */
  transcript?: string | null;
  /** Editor notes summary (optional) */
  editorNotesSummary?: string | null;
  /** Caption used on the post */
  captionUsed?: string | null;
  /** Hashtags used */
  hashtagsUsed?: string | null;
  /** Correlation ID for tracking */
  correlationId?: string;
}

export interface PostmortemResult {
  json: PostmortemJSON;
  markdown: string;
}

// ─── System Prompt ────────────────────────────────────────

const SYSTEM_PROMPT = `You are FlashFlow Postmortem Analyst — an expert at analyzing social media content performance.

Given a post's context (brief, transcript, editor notes) and its actual performance metrics, produce a structured postmortem analysis.

Return ONLY a valid JSON object matching this EXACT schema (no markdown fences):

{
  "summary": "2-3 sentence executive summary of performance",
  "what_worked": ["specific element that drove performance"],
  "what_failed": ["specific element that underperformed or missed"],
  "hook_analysis": {
    "hook_strength": 0-10,
    "pattern_detected": "name the hook pattern used (e.g., 'physical reveal', 'question opener', 'controversy lead')",
    "scroll_stop_rating": 0-10,
    "improvement": "specific suggestion to improve the hook"
  },
  "engagement_analysis": {
    "engagement_rate": 0.0,
    "comment_sentiment": "positive"|"neutral"|"mixed"|"negative",
    "share_driver": "what likely drove shares",
    "save_driver": "what likely drove saves"
  },
  "next_ideas": ["actionable idea for next content based on learnings"],
  "winner_candidate": true/false
}

Rules:
- engagement_rate = ((likes + comments + shares + saves) / views) * 100. Calculate from provided metrics.
- winner_candidate = true if: engagement_rate > 5% OR hook_strength >= 8 OR shares are > 10% of views
- what_worked and next_ideas must each have at least 1 item
- Be specific to THIS content, not generic advice
- If metrics are sparse (e.g. only views), still provide analysis based on available data
- Return ONLY valid JSON`;

// ─── Generator ────────────────────────────────────────────

function buildPrompt(input: PostmortemInput): string {
  const parts: string[] = [];

  parts.push(`PLATFORM: ${input.platform}`);
  parts.push(`POST URL: ${input.postUrl}\n`);

  // Metrics
  parts.push('PERFORMANCE METRICS:');
  const m = input.metrics;
  if (m.views != null) parts.push(`  Views: ${m.views.toLocaleString()}`);
  if (m.likes != null) parts.push(`  Likes: ${m.likes.toLocaleString()}`);
  if (m.comments != null) parts.push(`  Comments: ${m.comments.toLocaleString()}`);
  if (m.shares != null) parts.push(`  Shares: ${m.shares.toLocaleString()}`);
  if (m.saves != null) parts.push(`  Saves: ${m.saves.toLocaleString()}`);
  if (m.avg_watch_time_seconds != null) parts.push(`  Avg Watch Time: ${m.avg_watch_time_seconds}s`);
  if (m.completion_rate != null) parts.push(`  Completion Rate: ${m.completion_rate}%`);
  parts.push('');

  if (input.captionUsed) {
    parts.push('CAPTION USED:');
    parts.push(input.captionUsed.slice(0, 1000));
    parts.push('');
  }

  if (input.hashtagsUsed) {
    parts.push('HASHTAGS USED:');
    parts.push(input.hashtagsUsed.slice(0, 500));
    parts.push('');
  }

  if (input.briefSummary) {
    parts.push('BRIEF SUMMARY (what was planned):');
    parts.push(input.briefSummary.slice(0, 2000));
    parts.push('');
  }

  if (input.transcript) {
    parts.push('TRANSCRIPT (first 3000 chars):');
    parts.push(input.transcript.slice(0, 3000));
    parts.push('');
  }

  if (input.editorNotesSummary) {
    parts.push('EDITOR NOTES SUMMARY:');
    parts.push(input.editorNotesSummary.slice(0, 2000));
    parts.push('');
  }

  parts.push('Analyze this content performance and generate a postmortem. Return ONLY valid JSON.');
  return parts.join('\n');
}

export async function generatePostmortem(
  input: PostmortemInput,
): Promise<PostmortemResult> {
  const { parsed: raw } = await callAnthropicJSON<PostmortemJSON>(
    buildPrompt(input),
    {
      systemPrompt: SYSTEM_PROMPT,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 2048,
      temperature: 0.3,
      correlationId: input.correlationId,
      requestType: 'postmortem',
      agentId: 'postmortem-engine',
    },
  );

  const validation = safeValidatePostmortem(raw);
  if (!validation.ok) {
    throw new Error(`Postmortem schema validation failed: ${validation.error}`);
  }

  const json = validation.data!;
  const markdown = postmortemToMarkdown(json);
  return { json, markdown };
}

// ─── Markdown renderer ───────────────────────────────────

export function postmortemToMarkdown(pm: PostmortemJSON): string {
  const lines: string[] = [];

  lines.push('## AI Postmortem\n');
  lines.push(`**Summary:** ${pm.summary}\n`);

  lines.push('### What Worked');
  for (const item of pm.what_worked) lines.push(`- ${item}`);
  lines.push('');

  if (pm.what_failed.length > 0) {
    lines.push('### What Didn\'t Work');
    for (const item of pm.what_failed) lines.push(`- ${item}`);
    lines.push('');
  }

  lines.push('### Hook Analysis');
  lines.push(`- **Strength:** ${pm.hook_analysis.hook_strength}/10`);
  lines.push(`- **Pattern:** ${pm.hook_analysis.pattern_detected}`);
  lines.push(`- **Scroll-Stop:** ${pm.hook_analysis.scroll_stop_rating}/10`);
  lines.push(`- **Improvement:** ${pm.hook_analysis.improvement}`);
  lines.push('');

  lines.push('### Engagement');
  lines.push(`- **Rate:** ${pm.engagement_analysis.engagement_rate.toFixed(1)}%`);
  lines.push(`- **Comment Sentiment:** ${pm.engagement_analysis.comment_sentiment}`);
  lines.push(`- **Share Driver:** ${pm.engagement_analysis.share_driver}`);
  lines.push(`- **Save Driver:** ${pm.engagement_analysis.save_driver}`);
  lines.push('');

  lines.push('### Next Ideas');
  for (const idea of pm.next_ideas) lines.push(`- ${idea}`);
  lines.push('');

  if (pm.winner_candidate) {
    lines.push('> **Winner Candidate** — this content pattern should be replicated.');
  }

  return lines.join('\n');
}
