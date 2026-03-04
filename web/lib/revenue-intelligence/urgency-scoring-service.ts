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

// NOTE: Per-comment Telegram alerts (sendUrgentAlerts) were removed.
// All RI alerts must go through the single policy path:
//   run-ingestion.ts → evaluateAlertPolicy() → sendDigestAlert()
// This prevents Telegram spam from per-item sends.
