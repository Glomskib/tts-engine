/**
 * Creator Performance Profiles — Aggregation Engine
 *
 * Builds workspace-level performance profiles from existing data:
 *   - content_item_metrics_snapshots (views, engagement)
 *   - winner_patterns_v2 (what wins)
 *   - content_memory (hook/format patterns)
 *   - proven_hooks (hook effectiveness)
 *
 * Profiles answer: "What hooks, angles, formats, and personas work best for this creator?"
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { computePerformanceScore, getLengthBucket } from './winners/scoring';

const LOG = '[creator-profile]';

// ── Types ────────────────────────────────────────────────────────────

interface DimensionEntry {
  workspace_id: string;
  dimension: string;
  dimension_value: string;
  sample_size: number;
  avg_score: number;
  avg_views: number;
  avg_engagement_rate: number;
  win_rate: number;
  best_post_id: string | null;
  last_used_at: string | null;
}

interface PostRow {
  id: string;
  content_item_id: string;
  platform: string;
  product_id: string | null;
  posted_at: string | null;
  caption_used: string | null;
  content_item: {
    id: string;
    title: string | null;
    brief_selected_cow_tier: string | null;
  }[] | null;
}

export interface ProfileSummary {
  workspace_id: string;
  total_posts: number;
  total_views: number;
  avg_engagement_rate: number;
  median_views: number;
  best_score: number;
  dimensions: Record<string, Array<{
    value: string;
    sample_size: number;
    avg_score: number;
    avg_views: number;
    win_rate: number;
    confidence: string;
  }>>;
  last_aggregated_at: string;
}

// ── Confidence Logic ─────────────────────────────────────────────────

function getConfidenceLevel(samples: number): 'low' | 'medium' | 'high' {
  if (samples >= 20) return 'high';
  if (samples >= 5) return 'medium';
  return 'low';
}

// ── Main Aggregation ─────────────────────────────────────────────────

/**
 * Aggregate performance profile for a workspace.
 * Pulls all posts with metrics and builds dimension breakdowns.
 */
export async function aggregateCreatorProfile(workspaceId: string): Promise<{
  ok: boolean;
  total_posts: number;
  dimensions_updated: number;
}> {
  console.log(LOG, `aggregating profile for workspace=${workspaceId}`);

  // 1. Fetch all posts with latest metrics
  const { data: posts, error: postsErr } = await supabaseAdmin
    .from('content_item_posts')
    .select(`
      id, content_item_id, platform, product_id, posted_at, caption_used,
      content_item:content_items!content_item_id(id, title, brief_selected_cow_tier)
    `)
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .order('posted_at', { ascending: false })
    .limit(500);

  if (postsErr) {
    console.error(LOG, 'failed to fetch posts:', postsErr.message);
    return { ok: false, total_posts: 0, dimensions_updated: 0 };
  }

  if (!posts || posts.length === 0) {
    console.log(LOG, 'no posts found, skipping profile');
    return { ok: true, total_posts: 0, dimensions_updated: 0 };
  }

  // 2. Fetch latest metrics snapshot for each post
  const postIds = posts.map(p => p.id);
  const { data: snapshots } = await supabaseAdmin
    .from('content_item_metrics_snapshots')
    .select('content_item_post_id, views, likes, comments, shares, saves, avg_watch_time_seconds, completion_rate')
    .in('content_item_post_id', postIds)
    .order('captured_at', { ascending: false });

  // Dedupe to latest snapshot per post
  const latestByPost = new Map<string, typeof snapshots extends (infer T)[] | null ? T : never>();
  for (const snap of snapshots || []) {
    if (!latestByPost.has(snap.content_item_post_id)) {
      latestByPost.set(snap.content_item_post_id, snap);
    }
  }

  // 3. Fetch winner patterns for win rate calculation
  const { data: winners } = await supabaseAdmin
    .from('winner_pattern_evidence')
    .select('post_id')
    .eq('workspace_id', workspaceId);

  const winnerPostIds = new Set((winners || []).map(w => w.post_id));

  // 4. Fetch content_memory for hook/angle patterns
  const { data: memories } = await supabaseAdmin
    .from('content_memory')
    .select('memory_type, value, performance_score, occurrences')
    .eq('workspace_id', workspaceId);

  // 5. Fetch proven hooks for hook pattern stats
  const { data: provenHooks } = await supabaseAdmin
    .from('proven_hooks')
    .select('hook_text, hook_type, used_count, winner_count')
    .eq('workspace_id', workspaceId)
    .gt('used_count', 0);

  // 6. Calculate workspace median views for scoring
  const allViews = (posts as PostRow[])
    .map(p => latestByPost.get(p.id)?.views ?? 0)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  const medianViews = allViews.length > 0 ? allViews[Math.floor(allViews.length / 2)] : 100;

  // 7. Build dimension maps
  const dimMap = new Map<string, Map<string, { scores: number[]; views: number[]; engRates: number[]; wins: number; bestPostId: string | null; bestScore: number; lastUsed: string | null }>>();

  const ensureDim = (dim: string, val: string) => {
    if (!dimMap.has(dim)) dimMap.set(dim, new Map());
    const dMap = dimMap.get(dim)!;
    if (!dMap.has(val)) dMap.set(val, { scores: [], views: [], engRates: [], wins: 0, bestPostId: null, bestScore: 0, lastUsed: null });
    return dMap.get(val)!;
  };

  let totalViews = 0;
  let totalEngRate = 0;
  let bestScore = 0;
  let postsWithMetrics = 0;

  for (const post of posts as PostRow[]) {
    const snap = latestByPost.get(post.id);
    if (!snap || snap.views <= 0) continue;

    postsWithMetrics++;
    const score = computePerformanceScore(
      { views: snap.views, likes: snap.likes, comments: snap.comments, shares: snap.shares, saves: snap.saves, completion_rate: snap.completion_rate },
      medianViews,
    );
    const engRate = ((snap.likes + snap.comments + snap.shares + snap.saves) / snap.views) * 100;
    const isWinner = winnerPostIds.has(post.id);
    const lengthBucket = getLengthBucket(snap.avg_watch_time_seconds);

    totalViews += snap.views;
    totalEngRate += engRate;
    if (score > bestScore) bestScore = score;

    const addToDim = (dim: string, val: string) => {
      const entry = ensureDim(dim, val);
      entry.scores.push(score);
      entry.views.push(snap.views);
      entry.engRates.push(engRate);
      if (isWinner) entry.wins++;
      if (score > entry.bestScore) {
        entry.bestScore = score;
        entry.bestPostId = post.id;
      }
      if (!entry.lastUsed || (post.posted_at && post.posted_at > entry.lastUsed)) {
        entry.lastUsed = post.posted_at;
      }
    };

    // Platform dimension
    addToDim('platform', post.platform);

    // Length bucket dimension
    addToDim('length_bucket', lengthBucket);

    // Product dimension
    if (post.product_id) {
      addToDim('product', post.product_id);
    }

    // Extract hook pattern from caption
    if (post.caption_used) {
      const firstSentence = post.caption_used.match(/^[^.!?\n]+[.!?]/);
      if (firstSentence && firstSentence[0].length <= 100) {
        addToDim('hook_pattern', firstSentence[0].trim().toLowerCase());
      }
    }

    // COW tier as format proxy
    const ciArr = post.content_item;
    const ci = Array.isArray(ciArr) ? ciArr[0] : ciArr;
    if (ci && ci.brief_selected_cow_tier) {
      addToDim('format', ci.brief_selected_cow_tier);
    }
  }

  // 8. Add content_memory entries as additional dimension data
  for (const mem of memories || []) {
    if (mem.memory_type === 'hook' && mem.value) {
      const entry = ensureDim('hook_pattern', mem.value);
      // Supplement with memory score if no post data
      if (entry.scores.length === 0) {
        entry.scores.push(mem.performance_score);
      }
    }
    if (mem.memory_type === 'pattern' && mem.value) {
      const entry = ensureDim('angle', mem.value);
      if (entry.scores.length === 0) {
        entry.scores.push(mem.performance_score);
      }
    }
  }

  // 9. Add proven hook stats
  for (const hook of provenHooks || []) {
    if (hook.hook_type && hook.used_count > 0) {
      const entry = ensureDim('hook_type', hook.hook_type);
      const hookWinRate = hook.winner_count / hook.used_count * 100;
      if (entry.scores.length === 0) {
        entry.scores.push(hookWinRate);
      }
    }
  }

  // 10. Build dimension entries for upsert
  const dimEntries: DimensionEntry[] = [];
  for (const [dim, values] of dimMap) {
    for (const [val, data] of values) {
      if (data.scores.length === 0) continue;
      const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      const avgViews = data.views.length > 0 ? data.views.reduce((a, b) => a + b, 0) / data.views.length : 0;
      const avgEng = data.engRates.length > 0 ? data.engRates.reduce((a, b) => a + b, 0) / data.engRates.length : 0;
      const winRate = data.scores.length > 0 ? (data.wins / data.scores.length) * 100 : 0;

      dimEntries.push({
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: val,
        sample_size: data.scores.length,
        avg_score: Math.round(avgScore * 100) / 100,
        avg_views: Math.round(avgViews),
        avg_engagement_rate: Math.round(avgEng * 1000) / 1000,
        win_rate: Math.round(winRate * 100) / 100,
        best_post_id: data.bestPostId,
        last_used_at: data.lastUsed,
      });
    }
  }

  // 11. Upsert profile
  const avgEngRate = postsWithMetrics > 0 ? totalEngRate / postsWithMetrics : 0;
  await supabaseAdmin
    .from('creator_performance_profiles')
    .upsert({
      workspace_id: workspaceId,
      total_posts: postsWithMetrics,
      total_views: totalViews,
      avg_engagement_rate: Math.round(avgEngRate * 1000) / 1000,
      median_views: medianViews,
      best_score: bestScore,
      last_aggregated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' });

  // 12. Upsert dimension entries
  if (dimEntries.length > 0) {
    // Batch upsert in chunks of 50
    for (let i = 0; i < dimEntries.length; i += 50) {
      const chunk = dimEntries.slice(i, i + 50).map(e => ({
        ...e,
        updated_at: new Date().toISOString(),
      }));
      await supabaseAdmin
        .from('creator_profile_dimensions')
        .upsert(chunk, { onConflict: 'workspace_id,dimension,dimension_value' });
    }
  }

  // 13. Update confidence levels
  const confidenceEntries: Array<{
    workspace_id: string;
    dimension: string;
    total_samples: number;
    distinct_values: number;
    confidence_level: string;
    exploration_needed: boolean;
    updated_at: string;
  }> = [];

  for (const [dim, values] of dimMap) {
    const totalSamples = Array.from(values.values()).reduce((sum, d) => sum + d.scores.length, 0);
    const distinctValues = values.size;
    const confidence = getConfidenceLevel(totalSamples);

    confidenceEntries.push({
      workspace_id: workspaceId,
      dimension: dim,
      total_samples: totalSamples,
      distinct_values: distinctValues,
      confidence_level: confidence,
      exploration_needed: confidence === 'low' || distinctValues < 3,
      updated_at: new Date().toISOString(),
    });
  }

  if (confidenceEntries.length > 0) {
    await supabaseAdmin
      .from('creator_profile_confidence')
      .upsert(confidenceEntries, { onConflict: 'workspace_id,dimension' });
  }

  console.log(LOG, `profile updated: ${postsWithMetrics} posts, ${dimEntries.length} dimensions`);
  return { ok: true, total_posts: postsWithMetrics, dimensions_updated: dimEntries.length };
}

// ── Profile Reader ───────────────────────────────────────────────────

/**
 * Get the full profile summary for a workspace.
 */
export async function getCreatorProfile(workspaceId: string): Promise<ProfileSummary | null> {
  const { data: profile } = await supabaseAdmin
    .from('creator_performance_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!profile) return null;

  // Fetch top dimensions (top 5 per dimension, ordered by avg_score)
  const { data: dims } = await supabaseAdmin
    .from('creator_profile_dimensions')
    .select('dimension, dimension_value, sample_size, avg_score, avg_views, win_rate')
    .eq('workspace_id', workspaceId)
    .gte('sample_size', 2)
    .order('avg_score', { ascending: false })
    .limit(100);

  // Fetch confidence levels
  const { data: confRows } = await supabaseAdmin
    .from('creator_profile_confidence')
    .select('dimension, confidence_level')
    .eq('workspace_id', workspaceId);

  const confMap = new Map<string, string>();
  for (const c of confRows || []) {
    confMap.set(c.dimension, c.confidence_level);
  }

  // Group dimensions
  const dimensions: ProfileSummary['dimensions'] = {};
  for (const dim of dims || []) {
    if (!dimensions[dim.dimension]) dimensions[dim.dimension] = [];
    if (dimensions[dim.dimension].length < 5) {
      dimensions[dim.dimension].push({
        value: dim.dimension_value,
        sample_size: dim.sample_size,
        avg_score: dim.avg_score,
        avg_views: dim.avg_views,
        win_rate: dim.win_rate,
        confidence: confMap.get(dim.dimension) || 'low',
      });
    }
  }

  return {
    workspace_id: workspaceId,
    total_posts: profile.total_posts,
    total_views: profile.total_views,
    avg_engagement_rate: profile.avg_engagement_rate,
    median_views: profile.median_views,
    best_score: profile.best_score,
    dimensions,
    last_aggregated_at: profile.last_aggregated_at,
  };
}

// ── Generation Feedback ──────────────────────────────────────────────

/**
 * Get profile-informed suggestions for content generation.
 * Returns top-performing angles, hooks, and formats to bias generation toward.
 */
export async function getProfileSuggestions(workspaceId: string): Promise<{
  preferred_angles: string[];
  preferred_hook_patterns: string[];
  preferred_formats: string[];
  preferred_length: string | null;
  confidence: string;
} | null> {
  const { data: dims } = await supabaseAdmin
    .from('creator_profile_dimensions')
    .select('dimension, dimension_value, avg_score, sample_size')
    .eq('workspace_id', workspaceId)
    .gte('sample_size', 3)
    .order('avg_score', { ascending: false })
    .limit(50);

  if (!dims || dims.length === 0) return null;

  const topByDim = (dim: string, limit: number) =>
    dims.filter(d => d.dimension === dim).slice(0, limit).map(d => d.dimension_value);

  // Get overall confidence
  const { data: conf } = await supabaseAdmin
    .from('creator_profile_confidence')
    .select('confidence_level, total_samples')
    .eq('workspace_id', workspaceId);

  const totalSamples = (conf || []).reduce((sum, c) => sum + c.total_samples, 0);
  const overallConfidence = getConfidenceLevel(totalSamples);

  return {
    preferred_angles: topByDim('angle', 3),
    preferred_hook_patterns: topByDim('hook_pattern', 3),
    preferred_formats: topByDim('format', 2),
    preferred_length: topByDim('length_bucket', 1)[0] || null,
    confidence: overallConfidence,
  };
}
