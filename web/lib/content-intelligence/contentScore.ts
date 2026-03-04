/**
 * Content Score — grades post performance based on engagement rate and hook strength.
 *
 * Formula:
 *   engagement_rate = (likes + comments + shares) / views * 100
 *
 * Grade thresholds:
 *   A+  > 12%
 *   A   > 8%
 *   B   > 5%
 *   C   > 3%
 *   D   <= 3%
 *
 * Hook strength >= 8 bumps the grade up by one level.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createNotification } from '@/lib/notifications/notify';

export type ContentGrade = 'A+' | 'A' | 'B' | 'C' | 'D';

export interface ContentScoreResult {
  grade: ContentGrade;
  engagement_rate: number;
  hook_boosted: boolean;
}

const GRADE_ORDER: ContentGrade[] = ['D', 'C', 'B', 'A', 'A+'];

function gradeFromEngagement(rate: number): ContentGrade {
  if (rate > 12) return 'A+';
  if (rate > 8) return 'A';
  if (rate > 5) return 'B';
  if (rate > 3) return 'C';
  return 'D';
}

function bumpGrade(grade: ContentGrade): ContentGrade {
  const idx = GRADE_ORDER.indexOf(grade);
  if (idx < GRADE_ORDER.length - 1) return GRADE_ORDER[idx + 1];
  return grade; // already A+
}

/**
 * Calculate content score from metrics and optional hook strength.
 * Returns null if views are missing or zero (can't compute engagement).
 */
export function calculateContentScore(
  metrics: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  },
  hookStrength?: number | null,
): ContentScoreResult | null {
  if (!metrics.views || metrics.views <= 0) return null;

  const likes = metrics.likes ?? 0;
  const comments = metrics.comments ?? 0;
  const shares = metrics.shares ?? 0;

  const engagementRate = ((likes + comments + shares) / metrics.views) * 100;

  let grade = gradeFromEngagement(engagementRate);
  const hookBoosted = (hookStrength ?? 0) >= 8;

  if (hookBoosted) {
    grade = bumpGrade(grade);
  }

  return {
    grade,
    engagement_rate: Math.round(engagementRate * 100) / 100,
    hook_boosted: hookBoosted,
  };
}

/**
 * Calculate and persist content score for a post.
 * Fetches latest metrics and postmortem hook_strength, then updates the post.
 */
export async function scoreAndPersist(
  postId: string,
  workspaceId: string,
): Promise<ContentScoreResult | null> {
  // Get latest metrics
  const { data: metricsRow } = await supabaseAdmin
    .from('content_item_metrics_snapshots')
    .select('views, likes, comments, shares')
    .eq('content_item_post_id', postId)
    .eq('workspace_id', workspaceId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!metricsRow) return null;

  // Get hook_strength from latest postmortem (if any)
  let hookStrength: number | null = null;
  const { data: insight } = await supabaseAdmin
    .from('content_item_ai_insights')
    .select('json')
    .eq('content_item_post_id', postId)
    .eq('workspace_id', workspaceId)
    .eq('insight_type', 'postmortem')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (insight?.json) {
    const pm = insight.json as { hook_analysis?: { hook_strength?: number } };
    hookStrength = pm.hook_analysis?.hook_strength ?? null;
  }

  const result = calculateContentScore(
    {
      views: metricsRow.views,
      likes: metricsRow.likes,
      comments: metricsRow.comments,
      shares: metricsRow.shares,
    },
    hookStrength,
  );

  if (!result) return null;

  // Persist score on the post
  await supabaseAdmin
    .from('content_item_posts')
    .update({ performance_score: result.grade })
    .eq('id', postId)
    .eq('workspace_id', workspaceId);

  // Notify on A+ score
  if (result.grade === 'A+') {
    createNotification({
      workspaceId,
      type: 'score_A_plus',
      title: 'A+ Performance Score',
      message: `A post scored A+ with ${result.engagement_rate}% engagement${result.hook_boosted ? ' (hook boosted)' : ''}.`,
      link: `/admin/pipeline?video=${postId}`,
    }).catch(() => {});
  }

  return result;
}
