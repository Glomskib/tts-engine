/**
 * Revenue Intelligence – Comment Classification Service
 *
 * Takes unprocessed comments and uses Claude to:
 * 1. Classify into revenue-relevant category
 * 2. Score buying intent (0–100)
 * 3. Score urgency (0–100)
 * 4. Score confidence (0–100)
 *
 * Results are stored in ri_comment_analysis.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logAndTime } from './agent-logger';
import {
  RI_COMMENT_CATEGORIES,
  type ClassificationResult,
  type RiCommentCategory,
} from './types';

const TAG = '[ri:classification]';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_BATCH_SIZE = 20;

// ── Classification Prompt ──────────────────────────────────────

function buildClassificationPrompt(
  comments: Array<{ id: string; text: string; video_caption: string | null }>,
): string {
  const commentList = comments
    .map(
      (c, i) =>
        `[${i + 1}] id="${c.id}" video_context="${c.video_caption ?? 'unknown'}" comment="${c.text}"`,
    )
    .join('\n');

  return `You are a Revenue Intelligence agent for a TikTok e-commerce creator.
Classify each comment into exactly ONE category and score it.

CATEGORIES:
- buying_intent: wants to buy, asks about price, where to get it, link requests
- objection: hesitation, skepticism, concern about product quality/legitimacy
- shipping: delivery time, tracking, shipping cost questions
- support: product issues, returns, complaints, broken items
- praise: positive feedback, compliments, excitement
- troll: spam, hate, irrelevant, bot-like
- general: everything else (greetings, reactions, off-topic)

For each comment, output a JSON object with:
- id: the comment id
- category: one of the categories above
- subcategory: optional finer label (e.g. "price_ask", "where_to_buy", "skepticism")
- lead_score: 0-100 how likely this person is to buy (100 = highest intent)
- urgency_score: 0-100 how quickly this needs a response (100 = needs reply NOW)
- confidence_score: 0-100 how confident you are in this classification
- reasoning: one sentence explaining your classification

Respond with a JSON array only. No markdown, no explanation.

COMMENTS:
${commentList}`;
}

// ── Parse AI response ──────────────────────────────────────────

function parseClassificationResponse(
  raw: string,
): Array<{ id: string } & ClassificationResult> {
  let cleaned = raw.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array');
  }

  const validCategories = new Set(RI_COMMENT_CATEGORIES);

  return parsed.map((item: Record<string, unknown>) => {
    const category = String(item.category ?? 'general');
    return {
      id: String(item.id),
      category: (validCategories.has(category as RiCommentCategory)
        ? category
        : 'general') as RiCommentCategory,
      subcategory: item.subcategory ? String(item.subcategory) : null,
      lead_score: clamp(Number(item.lead_score ?? 0), 0, 100),
      urgency_score: clamp(Number(item.urgency_score ?? 0), 0, 100),
      confidence_score: clamp(Number(item.confidence_score ?? 50), 0, 100),
      reasoning: String(item.reasoning ?? ''),
    };
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, n)));
}

// ── Call Anthropic API ─────────────────────────────────────────

async function callClassificationAPI(
  prompt: string,
): Promise<string | null> {
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

// ── Store analysis results ─────────────────────────────────────

async function storeAnalysisResults(
  results: Array<{ id: string } & ClassificationResult>,
  validCommentIds: Set<string>,
): Promise<number> {
  const rows = results
    .filter((r) => {
      if (!validCommentIds.has(r.id)) {
        console.warn(`${TAG} Skipping analysis for unknown comment ID: ${r.id}`);
        return false;
      }
      return true;
    })
    .map((r) => ({
      comment_id: r.id,
      category: r.category,
      subcategory: r.subcategory,
      lead_score: r.lead_score,
      urgency_score: r.urgency_score,
      confidence_score: r.confidence_score,
      reasoning: r.reasoning,
    }));

  if (rows.length === 0) return 0;

  const { data, error } = await supabaseAdmin
    .from('ri_comment_analysis')
    .upsert(rows, { onConflict: 'comment_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    console.error(`${TAG} Store analysis failed:`, error.message);
    return 0;
  }

  return data?.length ?? 0;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Classify a batch of unprocessed comments.
 * Fetches video context for better classification accuracy.
 */
export async function classifyComments(
  comments: Array<{ id: string; comment_text: string; video_id: string }>,
): Promise<{ classified: number; errors: string[] }> {
  const timer = logAndTime('classify_comments', null);
  const errors: string[] = [];

  if (comments.length === 0) {
    await timer.finish({ classified: 0 });
    return { classified: 0, errors };
  }

  // Fetch video captions for context
  const videoIds = Array.from(new Set(comments.map((c) => c.video_id)));
  const { data: videos } = await supabaseAdmin
    .from('ri_videos')
    .select('id, caption')
    .in('id', videoIds);

  const captionMap = new Map<string, string | null>();
  for (const v of videos ?? []) {
    captionMap.set(v.id, v.caption);
  }

  const validIdSet = new Set(comments.map((c) => c.id));
  let totalClassified = 0;

  // Process in batches
  for (let i = 0; i < comments.length; i += MAX_BATCH_SIZE) {
    const batch = comments.slice(i, i + MAX_BATCH_SIZE);
    const enriched = batch.map((c) => ({
      id: c.id,
      text: c.comment_text,
      video_caption: captionMap.get(c.video_id) ?? null,
    }));

    const prompt = buildClassificationPrompt(enriched);
    const raw = await callClassificationAPI(prompt);

    if (!raw) {
      errors.push(`API call failed for batch starting at index ${i}`);
      continue;
    }

    try {
      const results = parseClassificationResponse(raw);
      const stored = await storeAnalysisResults(results, validIdSet);
      totalClassified += stored;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Parse error batch ${i}: ${msg}`);
      console.error(`${TAG} Parse failed:`, msg);
    }
  }

  await timer.finish(
    { classified: totalClassified, batches: Math.ceil(comments.length / MAX_BATCH_SIZE) },
    errors.length > 0 ? errors.join('; ') : undefined,
  );

  return { classified: totalClassified, errors };
}
