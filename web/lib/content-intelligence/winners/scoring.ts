/**
 * Winners Engine — Scoring & Pattern Key Builders
 *
 * Pure functions for normalizing performance scores and building pattern keys.
 */

import type { LengthBucket, PatternKey, PostWithMetrics } from './types';

/**
 * Compute normalized performance score (0-100) from metrics.
 *
 * Weighted formula:
 *   engagement_rate (40%) + view_velocity (30%) + share_rate (20%) + completion_bonus (10%)
 *
 * Each component is normalized against workspace percentiles passed as params.
 */
export function computePerformanceScore(
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    completion_rate: number | null;
  },
  workspaceMedianViews: number,
): number {
  if (metrics.views <= 0) return 0;

  const engagementRate =
    ((metrics.likes + metrics.comments + metrics.shares + metrics.saves) / metrics.views) * 100;

  // Normalize engagement rate: 5% → 50 points, 10%+ → 100 points
  const engagementScore = Math.min(100, (engagementRate / 10) * 100);

  // View velocity: ratio to workspace median (capped at 5x)
  const medianRef = Math.max(workspaceMedianViews, 1);
  const viewRatio = Math.min(metrics.views / medianRef, 5);
  const viewScore = (viewRatio / 5) * 100;

  // Share rate: shares/views normalized
  const shareRate = (metrics.shares / metrics.views) * 100;
  const shareScore = Math.min(100, (shareRate / 5) * 100);

  // Completion bonus
  const completionScore = metrics.completion_rate != null
    ? Math.min(100, metrics.completion_rate * 100)
    : 50; // neutral if unknown

  return Math.round(
    engagementScore * 0.4 +
    viewScore * 0.3 +
    shareScore * 0.2 +
    completionScore * 0.1
  );
}

/**
 * Determine video length bucket from watch time or caption heuristic.
 */
export function getLengthBucket(avgWatchTimeSeconds: number | null): LengthBucket {
  if (avgWatchTimeSeconds == null) return 'short'; // default
  if (avgWatchTimeSeconds < 15) return 'micro';
  if (avgWatchTimeSeconds < 30) return 'short';
  if (avgWatchTimeSeconds < 60) return 'medium';
  return 'long';
}

/**
 * Extract hook text from caption (first sentence or ~12 words).
 */
export function extractHookFromCaption(caption: string | null): string | null {
  if (!caption) return null;
  const trimmed = caption.trim();
  if (!trimmed) return null;

  // Try first sentence (period, ! or ?)
  const sentenceMatch = trimmed.match(/^[^.!?\n]+[.!?]/);
  if (sentenceMatch && sentenceMatch[0].length <= 150) {
    return sentenceMatch[0].trim();
  }

  // Fallback: first ~12 words
  const words = trimmed.split(/\s+/).slice(0, 12);
  return words.join(' ');
}

/**
 * Build a pattern key for grouping similar winning posts.
 */
export function buildPatternKey(post: PostWithMetrics): PatternKey {
  const hookText = post.hook_pattern || extractHookFromCaption(post.caption_used);
  return {
    platform: post.platform,
    product_id: post.product_id,
    hook_text: hookText,
    format_tag: post.format_tag || null,
    length_bucket: getLengthBucket(post.avg_watch_time_seconds),
  };
}

/**
 * Create a deterministic string key for pattern dedup/grouping.
 */
export function patternKeyString(key: PatternKey): string {
  return [
    key.platform,
    key.product_id || '_',
    key.hook_text || '_',
    key.format_tag || '_',
    key.length_bucket || '_',
  ].join('|');
}

/**
 * Check if a post qualifies as a "breakout" winner (top 2% by score).
 */
export function isBreakoutWinner(score: number, p98Threshold: number): boolean {
  return score >= p98Threshold;
}
