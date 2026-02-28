/**
 * Revenue Intelligence – Urgency Scoring Service
 *
 * Evaluates classified comments and flags urgent items that need
 * immediate attention. Sends Telegram alerts for high-urgency comments.
 *
 * Urgency criteria:
 * - buying_intent with lead_score >= 70 → urgent
 * - objection with urgency_score >= 60 → urgent
 * - support with urgency_score >= 50 → urgent
 * - Any comment with like_count >= 50 → urgent (viral comment)
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logAndTime } from './agent-logger';
import type { RiCommentCategory } from './types';

const TAG = '[ri:urgency]';

// ── Urgency thresholds ─────────────────────────────────────────

const URGENCY_RULES: Record<string, (analysis: AnalysisRow, comment: CommentRow) => boolean> = {
  buying_intent: (a) => a.lead_score >= 70,
  objection: (a) => a.urgency_score >= 60,
  support: (a) => a.urgency_score >= 50,
  shipping: (a) => a.urgency_score >= 60,
};

const VIRAL_COMMENT_THRESHOLD = 50; // likes

interface AnalysisRow {
  comment_id: string;
  category: RiCommentCategory;
  lead_score: number;
  urgency_score: number;
}

interface CommentRow {
  id: string;
  comment_text: string;
  commenter_username: string;
  like_count: number;
  video_id: string;
}

// ── Evaluate urgency for a batch ───────────────────────────────

function isUrgent(analysis: AnalysisRow, comment: CommentRow): boolean {
  // Viral comment check
  if (comment.like_count >= VIRAL_COMMENT_THRESHOLD) return true;

  // Category-specific rules
  const rule = URGENCY_RULES[analysis.category];
  if (rule && rule(analysis, comment)) return true;

  return false;
}

// ── Flag urgent comments ───────────────────────────────────────

export async function flagUrgentComments(
  commentIds: string[],
): Promise<{ flagged: number; errors: string[] }> {
  const timer = logAndTime('flag_urgent', null);
  const errors: string[] = [];

  if (commentIds.length === 0) {
    await timer.finish({ flagged: 0 });
    return { flagged: 0, errors };
  }

  // Fetch analysis + comment data
  const { data: analyses } = await supabaseAdmin
    .from('ri_comment_analysis')
    .select('comment_id, category, lead_score, urgency_score')
    .in('comment_id', commentIds);

  const { data: comments } = await supabaseAdmin
    .from('ri_comments')
    .select('id, comment_text, commenter_username, like_count, video_id')
    .in('id', commentIds);

  const analysisMap = new Map<string, AnalysisRow>();
  for (const a of analyses ?? []) {
    analysisMap.set(a.comment_id, a as AnalysisRow);
  }

  const commentMap = new Map<string, CommentRow>();
  for (const c of comments ?? []) {
    commentMap.set(c.id, c as CommentRow);
  }

  const urgentIds: string[] = [];

  for (const id of commentIds) {
    const analysis = analysisMap.get(id);
    const comment = commentMap.get(id);
    if (!analysis || !comment) continue;

    if (isUrgent(analysis, comment)) {
      urgentIds.push(id);
    }
  }

  // Flag urgent in comment_status
  if (urgentIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('ri_comment_status')
      .update({ flagged_urgent: true, updated_at: new Date().toISOString() })
      .in('comment_id', urgentIds);

    if (error) {
      errors.push(`Failed to flag urgent: ${error.message}`);
      console.error(`${TAG} Flag update failed:`, error.message);
    }
  }

  await timer.finish(
    { flagged: urgentIds.length, total: commentIds.length },
    errors.length > 0 ? errors.join('; ') : undefined,
  );

  return { flagged: urgentIds.length, errors };
}

// ── Telegram alert for urgent comments ─────────────────────────

export async function sendUrgentAlerts(
  commentIds: string[],
): Promise<void> {
  if (commentIds.length === 0) return;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.warn(`${TAG} Telegram not configured — skipping alerts`);
    return;
  }

  // Fetch urgent comments with analysis
  const { data: comments } = await supabaseAdmin
    .from('ri_comments')
    .select('id, comment_text, commenter_username, video_id')
    .in('id', commentIds);

  const { data: analyses } = await supabaseAdmin
    .from('ri_comment_analysis')
    .select('comment_id, category, lead_score, urgency_score')
    .in('comment_id', commentIds);

  const analysisMap = new Map<string, { category: string; lead_score: number; urgency_score: number }>();
  for (const a of analyses ?? []) {
    analysisMap.set(a.comment_id, a);
  }

  // Fetch video URLs for context
  const videoIds = Array.from(new Set((comments ?? []).map((c) => c.video_id)));
  const { data: videos } = await supabaseAdmin
    .from('ri_videos')
    .select('id, video_url, caption')
    .in('id', videoIds);

  const videoMap = new Map<string, { url: string | null; caption: string | null }>();
  for (const v of videos ?? []) {
    videoMap.set(v.id, { url: v.video_url, caption: v.caption });
  }

  const lines: string[] = ['🚨 *Revenue Intelligence — Urgent Comments*\n'];

  for (const comment of comments ?? []) {
    const analysis = analysisMap.get(comment.id);
    const video = videoMap.get(comment.video_id);
    const emoji = getCategoryEmoji(analysis?.category ?? 'general');

    lines.push(
      `${emoji} *@${comment.commenter_username}*`,
      `"${truncate(comment.comment_text, 100)}"`,
      `Category: ${analysis?.category ?? '?'} | Lead: ${analysis?.lead_score ?? 0} | Urgency: ${analysis?.urgency_score ?? 0}`,
      video?.url ? `Video: ${video.url}` : '',
      '',
    );
  }

  const message = lines.filter(Boolean).join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    console.log(`${TAG} Telegram alert sent for ${commentIds.length} urgent comment(s)`);
  } catch (err) {
    console.error(`${TAG} Telegram alert failed:`, err);
  }
}

// ── Helpers ────────────────────────────────────────────────────

function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    buying_intent: '💰',
    objection: '🤔',
    shipping: '📦',
    support: '🛠',
    praise: '⭐',
    troll: '🚫',
    general: '💬',
  };
  return map[category] ?? '💬';
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}
