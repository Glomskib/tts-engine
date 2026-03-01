/**
 * Revenue Intelligence – Actions Queue Service
 *
 * Manages the ri_actions_queue table: decides which comments warrant
 * reply or followup_script actions, enqueues them with dedup, and
 * provides CRUD for the queue UI.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type {
  RiCommentCategory,
  RiActionsQueueInsert,
  RiActionsQueueItem,
  RiQueueStatus,
  FollowupScriptPayload,
} from './types';

const TAG = '[ri:actions-queue]';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

// ── Priority Helper ─────────────────────────────────────────────

export function computePriorityScore(lead: number, urgency: number): number {
  return Math.round(0.7 * lead + 0.3 * urgency);
}

// ── Enqueue Decision Functions ──────────────────────────────────

const ACTIONABLE_CATEGORIES: Set<RiCommentCategory> = new Set([
  'buying_intent',
  'objection',
  'support',
]);

export function shouldEnqueueReply(
  category: RiCommentCategory,
  lead: number,
  urgency: number,
): boolean {
  return ACTIONABLE_CATEGORIES.has(category) && (lead >= 70 || urgency >= 80);
}

export function shouldEnqueueFollowup(
  category: RiCommentCategory,
  lead: number,
  urgency: number,
): boolean {
  return ACTIONABLE_CATEGORIES.has(category) && (lead >= 80 || urgency >= 85);
}

export function selectRecommendedTone(
  category: RiCommentCategory,
  lead: number,
): 'conversion' | 'neutral' | 'friendly' {
  if (category === 'buying_intent' && lead >= 70) return 'conversion';
  if (category === 'objection') return 'neutral';
  return 'friendly';
}

// ── Followup Script Generation ──────────────────────────────────

function buildFollowupPrompt(
  commentText: string,
  category: RiCommentCategory,
  videoCaption: string | null,
): string {
  return `You are a TikTok content strategist. A viewer left this comment on a video:

Comment: "${commentText}"
Category: ${category}
Video context: "${videoCaption ?? 'unknown'}"

Create a followup video script that directly addresses this viewer's interest/concern.
Return a JSON object with:
- hookOptions: array of 3 hook opening lines (1 sentence each, punchy)
- script: the full script body (2-4 sentences, conversational TikTok tone)
- broll: array of 2-3 B-roll suggestions to overlay
- cta: a single call-to-action line
- complianceNotes: any FTC/health/legal disclaimers needed (empty string if none)

JSON only. No markdown.`;
}

function parseFollowupResponse(raw: string): FollowupScriptPayload | null {
  let cleaned = raw.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(cleaned);
  return {
    hookOptions: Array.isArray(parsed.hookOptions) ? parsed.hookOptions.map(String) : [],
    script: String(parsed.script ?? ''),
    broll: Array.isArray(parsed.broll) ? parsed.broll.map(String) : [],
    cta: String(parsed.cta ?? ''),
    complianceNotes: String(parsed.complianceNotes ?? ''),
  };
}

export async function generateFollowupScript(
  commentText: string,
  category: RiCommentCategory,
  videoCaption: string | null,
): Promise<FollowupScriptPayload | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`${TAG} ANTHROPIC_API_KEY not set`);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const prompt = buildFollowupPrompt(commentText, category, videoCaption);
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${TAG} Followup API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text;
    if (!raw) return null;

    return parseFollowupResponse(raw);
  } catch (err) {
    console.error(`${TAG} Followup script generation failed:`, err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Main Enqueue Function ───────────────────────────────────────

export async function enqueueActions({
  userId,
  commentIds,
}: {
  userId: string;
  commentIds: string[];
}): Promise<{ enqueued: number; errors: string[] }> {
  const errors: string[] = [];
  if (commentIds.length === 0) return { enqueued: 0, errors };

  // Batch-fetch analyses
  const { data: analyses } = await supabaseAdmin
    .from('ri_comment_analysis')
    .select('comment_id, category, lead_score, urgency_score')
    .in('comment_id', commentIds);

  // Batch-fetch drafts
  const { data: drafts } = await supabaseAdmin
    .from('ri_reply_drafts')
    .select('comment_id, tone, draft_text')
    .in('comment_id', commentIds);

  // Batch-fetch comments (for text)
  const { data: comments } = await supabaseAdmin
    .from('ri_comments')
    .select('id, comment_text, video_id')
    .in('id', commentIds);

  // Batch-fetch video captions
  const videoIds = Array.from(new Set((comments ?? []).map((c) => c.video_id)));
  const { data: videos } = await supabaseAdmin
    .from('ri_videos')
    .select('id, caption')
    .in('id', videoIds);

  // Build maps
  const analysisMap = new Map<string, { category: RiCommentCategory; lead_score: number; urgency_score: number }>();
  for (const a of analyses ?? []) {
    analysisMap.set(a.comment_id, a as { category: RiCommentCategory; lead_score: number; urgency_score: number });
  }

  const draftMap = new Map<string, { neutral?: string; friendly?: string; conversion?: string }>();
  for (const d of drafts ?? []) {
    const existing = draftMap.get(d.comment_id) ?? {};
    existing[d.tone as 'neutral' | 'friendly' | 'conversion'] = d.draft_text;
    draftMap.set(d.comment_id, existing);
  }

  const commentMap = new Map<string, { comment_text: string; video_id: string }>();
  for (const c of comments ?? []) {
    commentMap.set(c.id, { comment_text: c.comment_text, video_id: c.video_id });
  }

  const captionMap = new Map<string, string | null>();
  for (const v of videos ?? []) {
    captionMap.set(v.id, v.caption);
  }

  const rows: RiActionsQueueInsert[] = [];

  for (const commentId of commentIds) {
    const analysis = analysisMap.get(commentId);
    if (!analysis) continue;

    const { category, lead_score, urgency_score } = analysis;
    const priority = computePriorityScore(lead_score, urgency_score);
    const comment = commentMap.get(commentId);

    // Reply action
    if (shouldEnqueueReply(category, lead_score, urgency_score)) {
      const commentDrafts = draftMap.get(commentId) ?? {};
      const recommendedTone = selectRecommendedTone(category, lead_score);

      rows.push({
        user_id: userId,
        comment_id: commentId,
        action_type: 'reply',
        priority_score: priority,
        status: 'queued',
        payload: {
          category,
          lead_score,
          urgency_score,
          priority_score: priority,
          drafts: commentDrafts,
          recommendedTone,
        },
        dedup_key: `reply:${commentId}`,
      });
    }

    // Followup script action
    if (shouldEnqueueFollowup(category, lead_score, urgency_score) && comment) {
      const videoCaption = captionMap.get(comment.video_id) ?? null;
      const script = await generateFollowupScript(comment.comment_text, category, videoCaption);

      rows.push({
        user_id: userId,
        comment_id: commentId,
        action_type: 'followup_script',
        priority_score: priority,
        status: 'queued',
        payload: script
          ? (script as unknown as Record<string, unknown>)
          : { error: 'script_generation_failed' },
        dedup_key: `followup:${commentId}`,
      });
    }
  }

  if (rows.length === 0) return { enqueued: 0, errors };

  const { data, error } = await supabaseAdmin
    .from('ri_actions_queue')
    .upsert(rows, { onConflict: 'dedup_key', ignoreDuplicates: true })
    .select('id');

  if (error) {
    errors.push(`Upsert failed: ${error.message}`);
    console.error(`${TAG} Upsert failed:`, error.message);
    return { enqueued: 0, errors };
  }

  const enqueued = data?.length ?? 0;
  console.log(`${TAG} Enqueued ${enqueued} action(s) for ${commentIds.length} comment(s)`);
  return { enqueued, errors };
}

// ── Queue CRUD ──────────────────────────────────────────────────

export async function getQueueItems(
  userId: string,
  status?: RiQueueStatus,
  limit = 20,
  offset = 0,
): Promise<RiActionsQueueItem[]> {
  let query = supabaseAdmin
    .from('ri_actions_queue')
    .select('*, ri_comments!inner(platform_comment_id)')
    .eq('user_id', userId)
    .not('ri_comments.platform_comment_id', 'like', 'sim_%')
    .order('priority_score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`${TAG} getQueueItems failed:`, error.message);
    return [];
  }

  // Strip the joined ri_comments field from the result
  return (data ?? []).map(({ ri_comments, ...item }) => item as RiActionsQueueItem);
}

export async function updateQueueItemStatus(
  itemId: string,
  newStatus: RiQueueStatus,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('ri_actions_queue')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) {
    console.error(`${TAG} updateQueueItemStatus failed:`, error.message);
    return false;
  }

  return true;
}
