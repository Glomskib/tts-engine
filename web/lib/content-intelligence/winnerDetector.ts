/**
 * Winner Detector — evaluates whether a post is a "winner" and inserts
 * into the existing winners_bank via createWinner().
 *
 * Called after a postmortem is generated when winner_candidate = true.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createWinner } from '@/lib/winners';
import { createNotification } from '@/lib/notifications/notify';
import type { PostmortemJSON } from '@/lib/ai/postmortem/generatePostmortem';

export interface WinnerEvaluation {
  isWinner: boolean;
  reasons: string[];
}

/**
 * Evaluate whether a post qualifies as a "winner" based on metrics and postmortem.
 *
 * Criteria (any match → winner):
 *   1. engagement_rate > workspace average
 *   2. hook_strength >= 8
 *   3. share_rate unusually high (shares > 10% of views)
 */
export function evaluateWinnerCriteria(
  postmortem: PostmortemJSON,
  metrics: { views: number | null; shares: number | null },
  workspaceAvgEngagement?: number,
): WinnerEvaluation {
  const reasons: string[] = [];

  // Criterion 1: engagement rate > workspace average (default 3% if no average)
  const avgThreshold = workspaceAvgEngagement ?? 3;
  if (postmortem.engagement_analysis.engagement_rate > avgThreshold) {
    reasons.push(`Engagement rate ${postmortem.engagement_analysis.engagement_rate.toFixed(1)}% exceeds workspace average ${avgThreshold.toFixed(1)}%`);
  }

  // Criterion 2: hook strength >= 8
  if (postmortem.hook_analysis.hook_strength >= 8) {
    reasons.push(`Hook strength ${postmortem.hook_analysis.hook_strength}/10`);
  }

  // Criterion 3: share rate > 10% of views
  if (metrics.views && metrics.shares && metrics.views > 0) {
    const shareRate = (metrics.shares / metrics.views) * 100;
    if (shareRate > 10) {
      reasons.push(`Share rate ${shareRate.toFixed(1)}% (unusually high)`);
    }
  }

  return { isWinner: reasons.length > 0, reasons };
}

/**
 * Evaluate a post and insert into winners_bank if it qualifies.
 * Returns the winner ID if inserted, null otherwise.
 */
export async function evaluateWinner(postId: string, workspaceId: string): Promise<{ id: string } | null> {
  // Load the latest postmortem for this post
  const { data: insight } = await supabaseAdmin
    .from('content_item_ai_insights')
    .select('json')
    .eq('content_item_post_id', postId)
    .eq('workspace_id', workspaceId)
    .eq('insight_type', 'postmortem')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!insight?.json) return null;

  const postmortem = insight.json as PostmortemJSON;

  // Load post + latest metrics
  const { data: post } = await supabaseAdmin
    .from('content_item_posts')
    .select('id, platform, post_url, caption_used, posted_at')
    .eq('id', postId)
    .eq('workspace_id', workspaceId)
    .single();

  if (!post) return null;

  const { data: metricsRow } = await supabaseAdmin
    .from('content_item_metrics_snapshots')
    .select('views, likes, comments, shares, saves')
    .eq('content_item_post_id', postId)
    .eq('workspace_id', workspaceId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Compute workspace average engagement rate from recent postmortems
  const { data: allInsights } = await supabaseAdmin
    .from('content_item_ai_insights')
    .select('json')
    .eq('workspace_id', workspaceId)
    .eq('insight_type', 'postmortem')
    .order('generated_at', { ascending: false })
    .limit(50);

  let avgEngagement: number | undefined;
  if (allInsights && allInsights.length > 1) {
    const rates = allInsights
      .map(i => (i.json as PostmortemJSON)?.engagement_analysis?.engagement_rate)
      .filter((r): r is number => typeof r === 'number' && r > 0);
    if (rates.length > 0) {
      avgEngagement = rates.reduce((a, b) => a + b, 0) / rates.length;
    }
  }

  const evaluation = evaluateWinnerCriteria(
    postmortem,
    { views: metricsRow?.views ?? null, shares: metricsRow?.shares ?? null },
    avgEngagement,
  );

  if (!evaluation.isWinner) return null;

  // Insert into existing winners_bank via createWinner
  const { winner, error } = await createWinner(workspaceId, {
    source_type: 'generated',
    winner_type: 'hook',
    hook: postmortem.hook_analysis.pattern_detected,
    video_url: post.post_url,
    notes: `Auto-detected by AI Postmortem. Reasons: ${evaluation.reasons.join('; ')}`,
    view_count: metricsRow?.views ?? undefined,
    like_count: metricsRow?.likes ?? undefined,
    comment_count: metricsRow?.comments ?? undefined,
    share_count: metricsRow?.shares ?? undefined,
    save_count: metricsRow?.saves ?? undefined,
    engagement_rate: postmortem.engagement_analysis.engagement_rate,
    posted_at: post.posted_at ?? undefined,
  });

  if (error || !winner) {
    console.error('[winnerDetector] createWinner error:', error);
    return null;
  }

  // Notify user of new winner
  createNotification({
    workspaceId,
    type: 'new_winner',
    title: 'New Winner Detected',
    message: `AI detected a winning post: ${evaluation.reasons[0] || 'meets winner criteria'}.`,
    link: '/admin/winners',
  }).catch(() => {});

  return { id: winner.id };
}
