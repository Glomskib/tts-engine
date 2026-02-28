/**
 * Revenue Intelligence – Reply Draft Service
 *
 * Generates 3 reply drafts per comment:
 * - neutral: professional, non-committal
 * - friendly: warm, emoji-friendly, approachable
 * - conversion: sales-leaning, includes CTA
 *
 * Uses Claude to generate contextual replies.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logAndTime } from './agent-logger';
import {
  RI_REPLY_TONES,
  type RiReplyTone,
  type ReplyDraftSet,
} from './types';

const TAG = '[ri:reply-draft]';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_BATCH_SIZE = 10;

// ── Reply Generation Prompt ────────────────────────────────────

function buildReplyPrompt(
  comments: Array<{
    id: string;
    text: string;
    video_caption: string | null;
    category: string;
    lead_score: number;
  }>,
): string {
  const commentList = comments
    .map(
      (c, i) =>
        `[${i + 1}] id="${c.id}" category="${c.category}" lead_score=${c.lead_score} video="${c.video_caption ?? 'unknown'}" comment="${c.text}"`,
    )
    .join('\n');

  return `You are a TikTok reply assistant for an e-commerce creator.
Generate 3 reply drafts for each comment. Each reply must be:
- Under 150 characters (TikTok comment length limit)
- Natural-sounding, not robotic
- Appropriate for the comment's category and intent

TONES:
- neutral: professional, helpful, non-pushy
- friendly: warm, uses casual language, can include 1-2 emojis
- conversion: gently nudges toward purchase, mentions link-in-bio or DM for details

RULES:
- For "troll" comments: neutral should be a polite redirect, friendly can be witty, conversion should still be professional
- For "buying_intent": lean into helpfulness across all tones
- For "objection": address the concern directly, don't be dismissive
- For "praise": thank them genuinely
- Never use fake urgency or scarcity tactics
- Never promise discounts unless the comment asks about one

Respond with a JSON array. Each item:
- id: comment id
- neutral: the neutral reply
- friendly: the friendly reply
- conversion: the conversion reply

JSON array only. No markdown.

COMMENTS:
${commentList}`;
}

// ── Parse response ─────────────────────────────────────────────

function parseReplyResponse(
  raw: string,
): Array<{ id: string } & ReplyDraftSet> {
  let cleaned = raw.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array');
  }

  return parsed.map((item: Record<string, unknown>) => ({
    id: String(item.id),
    neutral: String(item.neutral ?? ''),
    friendly: String(item.friendly ?? ''),
    conversion: String(item.conversion ?? ''),
  }));
}

// ── Call API ───────────────────────────────────────────────────

async function callReplyAPI(prompt: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`${TAG} ANTHROPIC_API_KEY not set`);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${TAG} API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    return data.content?.[0]?.text ?? null;
  } catch (err) {
    console.error(`${TAG} API call failed:`, err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Store drafts ───────────────────────────────────────────────

async function storeDrafts(
  results: Array<{ id: string } & ReplyDraftSet>,
  validCommentIds: Set<string>,
): Promise<number> {
  const rows: Array<{ comment_id: string; tone: RiReplyTone; draft_text: string }> = [];

  for (const r of results) {
    // Only store drafts for IDs we actually sent — AI can mangle UUIDs
    if (!validCommentIds.has(r.id)) {
      console.warn(`${TAG} Skipping draft for unknown comment ID: ${r.id}`);
      continue;
    }
    for (const tone of RI_REPLY_TONES) {
      const text = r[tone];
      if (text && text.length > 0) {
        rows.push({ comment_id: r.id, tone, draft_text: text });
      }
    }
  }

  if (rows.length === 0) return 0;

  const { data, error } = await supabaseAdmin
    .from('ri_reply_drafts')
    .insert(rows)
    .select('id');

  if (error) {
    console.error(`${TAG} Store drafts failed:`, error.message);
    return 0;
  }

  return data?.length ?? 0;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Generate reply drafts for classified comments.
 * Requires comments to already have analysis records.
 */
export async function generateReplyDrafts(
  commentIds: string[],
): Promise<{ generated: number; errors: string[] }> {
  const timer = logAndTime('generate_reply_drafts', null);
  const errors: string[] = [];

  if (commentIds.length === 0) {
    await timer.finish({ generated: 0 });
    return { generated: 0, errors };
  }

  // Check which comments already have drafts — skip them
  const { data: existingDrafts } = await supabaseAdmin
    .from('ri_reply_drafts')
    .select('comment_id')
    .in('comment_id', commentIds);

  const existingSet = new Set((existingDrafts ?? []).map((d) => d.comment_id));
  const newIds = commentIds.filter((id) => !existingSet.has(id));

  if (newIds.length === 0) {
    await timer.finish({ generated: 0, skipped: commentIds.length });
    return { generated: 0, errors };
  }

  // Fetch comment text + analysis for context
  const { data: comments } = await supabaseAdmin
    .from('ri_comments')
    .select('id, comment_text, video_id')
    .in('id', newIds);

  const { data: analyses } = await supabaseAdmin
    .from('ri_comment_analysis')
    .select('comment_id, category, lead_score')
    .in('comment_id', newIds);

  const analysisMap = new Map<string, { category: string; lead_score: number }>();
  for (const a of analyses ?? []) {
    analysisMap.set(a.comment_id, { category: a.category, lead_score: a.lead_score });
  }

  // Fetch video captions
  const videoIds = Array.from(new Set((comments ?? []).map((c) => c.video_id)));
  const { data: videos } = await supabaseAdmin
    .from('ri_videos')
    .select('id, caption')
    .in('id', videoIds);

  const captionMap = new Map<string, string | null>();
  for (const v of videos ?? []) {
    captionMap.set(v.id, v.caption);
  }

  const enriched = (comments ?? []).map((c) => {
    const analysis = analysisMap.get(c.id);
    return {
      id: c.id,
      text: c.comment_text,
      video_caption: captionMap.get(c.video_id) ?? null,
      category: analysis?.category ?? 'general',
      lead_score: analysis?.lead_score ?? 0,
    };
  });

  const validIdSet = new Set(newIds);
  let totalGenerated = 0;

  for (let i = 0; i < enriched.length; i += MAX_BATCH_SIZE) {
    const batch = enriched.slice(i, i + MAX_BATCH_SIZE);
    const prompt = buildReplyPrompt(batch);
    const raw = await callReplyAPI(prompt);

    if (!raw) {
      errors.push(`API call failed for batch at index ${i}`);
      continue;
    }

    try {
      const results = parseReplyResponse(raw);
      const stored = await storeDrafts(results, validIdSet);
      totalGenerated += stored;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Parse error batch ${i}: ${msg}`);
      console.error(`${TAG} Parse failed:`, msg);
    }
  }

  await timer.finish(
    { generated: totalGenerated, comments: newIds.length },
    errors.length > 0 ? errors.join('; ') : undefined,
  );

  return { generated: totalGenerated, errors };
}
