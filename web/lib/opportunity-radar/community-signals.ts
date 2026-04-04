/**
 * Community Intelligence — Signal Recording & Aggregation
 *
 * Records community performance signals when users publish videos
 * linked to trend-tracked products, and feeds that data back into
 * the trend engine for improved recommendations.
 *
 * Lightweight: one DB insert + one aggregate update per signal.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizeProductKey } from './clustering';

// ── Types ───────────────────────────────────────────────────────────

export interface CommunitySignalInput {
  workspaceId: string;
  contentItemId: string;
  contentItemPostId: string;
  productName: string | null;
  productId: string | null;
  postedAt: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
}

export interface ClusterCommunityStats {
  community_wins: number;
  community_total_views: number;
  community_best_hook: string | null;
}

// ── Record a community signal ───────────────────────────────────────

/**
 * Record a community signal when a content item is posted.
 * Resolves the trend cluster (if any) and updates aggregate stats.
 * Non-fatal — errors are logged but don't block the caller.
 */
export async function recordCommunitySignal(input: CommunitySignalInput): Promise<void> {
  try {
    const normalizedKey = input.productName
      ? normalizeProductKey(input.productName)
      : null;

    // Find matching trend cluster by product key
    let clusterId: string | null = null;
    if (normalizedKey) {
      const { data: cluster } = await supabaseAdmin
        .from('trend_clusters')
        .select('id')
        .eq('normalized_product_key', normalizedKey)
        .maybeSingle();

      clusterId = cluster?.id ?? null;
    }

    // Insert community signal
    const { error: insertErr } = await supabaseAdmin
      .from('community_signals')
      .insert({
        workspace_id: input.workspaceId,
        content_item_id: input.contentItemId,
        content_item_post_id: input.contentItemPostId,
        trend_cluster_id: clusterId,
        product_name: input.productName,
        normalized_product_key: normalizedKey,
        views: input.views ?? 0,
        likes: input.likes ?? 0,
        comments: input.comments ?? 0,
        shares: input.shares ?? 0,
        posted_at: input.postedAt,
      });

    if (insertErr) {
      console.error('[community-signals] insert failed:', insertErr.message);
      return;
    }

    // Update cluster aggregate stats if cluster exists
    if (clusterId) {
      await refreshClusterCommunityStats(clusterId);
    }
  } catch (err) {
    console.error('[community-signals] recordCommunitySignal failed (non-fatal):',
      err instanceof Error ? err.message : err);
  }
}

// ── Refresh cluster community aggregates ────────────────────────────

/**
 * Recompute community signal aggregates for a cluster.
 */
export async function refreshClusterCommunityStats(
  clusterId: string,
): Promise<ClusterCommunityStats> {
  const { data: signals } = await supabaseAdmin
    .from('community_signals')
    .select('views')
    .eq('trend_cluster_id', clusterId);

  const wins = signals?.length ?? 0;
  const totalViews = (signals ?? []).reduce((sum, s) => sum + (s.views || 0), 0);

  // Find best hook from winning_hooks for this cluster
  const { data: bestHook } = await supabaseAdmin
    .from('winning_hooks')
    .select('hook_text')
    .eq('trend_cluster_id', clusterId)
    .order('performance_score', { ascending: false })
    .limit(1)
    .maybeSingle();

  const stats: ClusterCommunityStats = {
    community_wins: wins,
    community_total_views: totalViews,
    community_best_hook: bestHook?.hook_text ?? null,
  };

  await supabaseAdmin
    .from('trend_clusters')
    .update(stats)
    .eq('id', clusterId);

  return stats;
}

// ── Query community stats for a cluster ─────────────────────────────

export async function getClusterCommunityStats(
  clusterId: string,
): Promise<ClusterCommunityStats> {
  const { data } = await supabaseAdmin
    .from('trend_clusters')
    .select('community_wins, community_total_views, community_best_hook')
    .eq('id', clusterId)
    .single();

  return {
    community_wins: data?.community_wins ?? 0,
    community_total_views: data?.community_total_views ?? 0,
    community_best_hook: data?.community_best_hook ?? null,
  };
}

// ── Update signal metrics (called when metrics are refreshed) ───────

export async function updateSignalMetrics(
  contentItemPostId: string,
  metrics: { views: number; likes: number; comments: number; shares: number },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('community_signals')
    .update(metrics)
    .eq('content_item_post_id', contentItemPostId);

  if (error) {
    console.error('[community-signals] updateSignalMetrics failed:', error.message);
    return;
  }

  // Re-aggregate cluster stats
  const { data: signal } = await supabaseAdmin
    .from('community_signals')
    .select('trend_cluster_id')
    .eq('content_item_post_id', contentItemPostId)
    .maybeSingle();

  if (signal?.trend_cluster_id) {
    await refreshClusterCommunityStats(signal.trend_cluster_id);
  }
}
