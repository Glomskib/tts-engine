/**
 * Winners Engine — Detection Job
 *
 * Pulls recent metrics, scores posts, detects winning patterns,
 * and upserts into winner_patterns_v2 + winner_pattern_evidence.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  computePerformanceScore,
  buildPatternKey,
  patternKeyString,
  isBreakoutWinner,
} from './scoring';
import type {
  PostWithMetrics,
  PatternKey,
  DetectWinnersResult,
} from './types';

const MIN_SAMPLE_SIZE = 3;
const LOOKBACK_DAYS = 30;

interface ScoredPost {
  post: PostWithMetrics;
  score: number;
  patternKey: PatternKey;
}

/**
 * Run winner detection for a single workspace.
 */
export async function detectWinners(workspaceId: string): Promise<DetectWinnersResult> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();

  // 1. Fetch recent posts with latest metrics
  const posts = await fetchPostsWithMetrics(workspaceId, cutoff);
  if (posts.length === 0) {
    return { patterns_upserted: 0, evidence_inserted: 0, posts_analyzed: 0 };
  }

  // 2. Compute workspace median views for normalization
  const allViews = posts.map(p => p.views).filter(v => v > 0).sort((a, b) => a - b);
  const medianViews = allViews.length > 0
    ? allViews[Math.floor(allViews.length / 2)]
    : 100;

  // 3. Score each post
  const scored: ScoredPost[] = posts.map(post => ({
    post,
    score: computePerformanceScore(
      {
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        saves: post.saves,
        completion_rate: post.completion_rate,
      },
      medianViews,
    ),
    patternKey: buildPatternKey(post),
  }));

  // 4. Calculate P98 threshold for breakout detection
  const sortedScores = scored.map(s => s.score).sort((a, b) => a - b);
  const p98Index = Math.floor(sortedScores.length * 0.98);
  const p98Threshold = sortedScores[p98Index] || 80;

  // 5. Group by pattern key
  const patternGroups = new Map<string, ScoredPost[]>();
  for (const s of scored) {
    const key = patternKeyString(s.patternKey);
    const group = patternGroups.get(key) || [];
    group.push(s);
    patternGroups.set(key, group);
  }

  // 6. Filter to qualifying patterns
  let patternsUpserted = 0;
  let evidenceInserted = 0;

  for (const [, group] of patternGroups) {
    const meetsMinSample = group.length >= MIN_SAMPLE_SIZE;
    const hasBreakout = group.some(s => isBreakoutWinner(s.score, p98Threshold));

    if (!meetsMinSample && !hasBreakout) continue;

    const representative = group[0];
    const avgScore = group.reduce((sum, s) => sum + s.score, 0) / group.length;
    const avgViews = group.reduce((sum, s) => sum + s.post.views, 0) / group.length;
    const totalEngagement = group.reduce((sum, s) => {
      const total = s.post.likes + s.post.comments + s.post.shares + s.post.saves;
      const rate = s.post.views > 0 ? (total / s.post.views) * 100 : 0;
      return sum + rate;
    }, 0);
    const avgEngagement = totalEngagement / group.length;
    const latestWin = group
      .map(s => s.post.posted_at)
      .filter(Boolean)
      .sort()
      .pop() || null;

    // Upsert pattern
    const patternId = await upsertPattern(workspaceId, {
      ...representative.patternKey,
      score: Math.round(avgScore * 100) / 100,
      sample_size: group.length,
      avg_views: Math.round(avgViews),
      avg_engagement_rate: Math.round(avgEngagement * 100) / 100,
      last_win_at: latestWin,
    });

    if (!patternId) continue;
    patternsUpserted++;

    // Insert evidence rows
    for (const s of group) {
      const { error } = await supabaseAdmin
        .from('winner_pattern_evidence')
        .insert({
          winner_pattern_id: patternId,
          content_item_id: s.post.content_item_id,
          post_id: s.post.post_id,
          metric_snapshot_id: s.post.metric_snapshot_id,
          contribution_score: s.score,
        });
      if (!error) evidenceInserted++;
    }
  }

  return {
    patterns_upserted: patternsUpserted,
    evidence_inserted: evidenceInserted,
    posts_analyzed: posts.length,
  };
}

/**
 * Fetch posts with their latest metrics snapshot and AI insight data.
 */
async function fetchPostsWithMetrics(
  workspaceId: string,
  cutoff: string,
): Promise<PostWithMetrics[]> {
  // Get posts posted after cutoff
  const { data: posts, error: postsError } = await supabaseAdmin
    .from('content_item_posts')
    .select(`
      id,
      content_item_id,
      platform,
      product_id,
      caption_used,
      posted_at,
      performance_score,
      content_items:content_item_id(title)
    `)
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .gte('posted_at', cutoff)
    .order('posted_at', { ascending: false });

  if (postsError || !posts || posts.length === 0) return [];

  const result: PostWithMetrics[] = [];

  for (const post of posts) {
    // Get latest metrics snapshot
    const { data: metrics } = await supabaseAdmin
      .from('content_item_metrics_snapshots')
      .select('id, views, likes, comments, shares, saves, avg_watch_time_seconds, completion_rate')
      .eq('content_item_post_id', post.id)
      .eq('workspace_id', workspaceId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!metrics || !metrics.views || metrics.views <= 0) continue;

    // Get AI insight (postmortem) for hook data
    const { data: insight } = await supabaseAdmin
      .from('content_item_ai_insights')
      .select('json')
      .eq('content_item_post_id', post.id)
      .eq('workspace_id', workspaceId)
      .eq('insight_type', 'postmortem')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const postmortem = insight?.json as {
      hook_analysis?: { hook_strength?: number; pattern_detected?: string };
      content_format?: string;
    } | null;

    const ci = post.content_items as unknown as { title: string } | null;

    result.push({
      post_id: post.id,
      content_item_id: post.content_item_id,
      platform: post.platform,
      product_id: post.product_id,
      caption_used: post.caption_used,
      posted_at: post.posted_at,
      performance_score: post.performance_score,
      views: metrics.views ?? 0,
      likes: metrics.likes ?? 0,
      comments: metrics.comments ?? 0,
      shares: metrics.shares ?? 0,
      saves: metrics.saves ?? 0,
      avg_watch_time_seconds: metrics.avg_watch_time_seconds,
      completion_rate: metrics.completion_rate,
      metric_snapshot_id: metrics.id,
      title: ci?.title ?? null,
      hook_strength: postmortem?.hook_analysis?.hook_strength ?? null,
      hook_pattern: postmortem?.hook_analysis?.pattern_detected ?? null,
      format_tag: postmortem?.content_format ?? null,
    });
  }

  return result;
}

/**
 * Upsert a winner pattern row. Returns the pattern ID.
 */
async function upsertPattern(
  workspaceId: string,
  data: PatternKey & {
    score: number;
    sample_size: number;
    avg_views: number;
    avg_engagement_rate: number;
    last_win_at: string | null;
  },
): Promise<string | null> {
  // Try to find existing pattern
  let query = supabaseAdmin
    .from('winner_patterns_v2')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('platform', data.platform);

  if (data.product_id) {
    query = query.eq('product_id', data.product_id);
  } else {
    query = query.is('product_id', null);
  }

  if (data.hook_text) {
    query = query.eq('hook_text', data.hook_text);
  } else {
    query = query.is('hook_text', null);
  }

  if (data.format_tag) {
    query = query.eq('format_tag', data.format_tag);
  } else {
    query = query.is('format_tag', null);
  }

  if (data.length_bucket) {
    query = query.eq('length_bucket', data.length_bucket);
  } else {
    query = query.is('length_bucket', null);
  }

  const { data: existing } = await query.limit(1).maybeSingle();

  if (existing) {
    // Update
    const { error } = await supabaseAdmin
      .from('winner_patterns_v2')
      .update({
        score: data.score,
        sample_size: data.sample_size,
        avg_views: data.avg_views,
        avg_engagement_rate: data.avg_engagement_rate,
        last_win_at: data.last_win_at,
      })
      .eq('id', existing.id);

    if (error) {
      console.error('[detectWinners] update error:', error);
      return null;
    }

    // Clear old evidence for this pattern before re-inserting
    await supabaseAdmin
      .from('winner_pattern_evidence')
      .delete()
      .eq('winner_pattern_id', existing.id);

    return existing.id;
  }

  // Insert new
  const { data: inserted, error } = await supabaseAdmin
    .from('winner_patterns_v2')
    .insert({
      workspace_id: workspaceId,
      platform: data.platform,
      product_id: data.product_id,
      hook_text: data.hook_text,
      format_tag: data.format_tag,
      length_bucket: data.length_bucket,
      score: data.score,
      sample_size: data.sample_size,
      avg_views: data.avg_views,
      avg_engagement_rate: data.avg_engagement_rate,
      last_win_at: data.last_win_at,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[detectWinners] insert error:', error);
    return null;
  }

  return inserted?.id ?? null;
}
