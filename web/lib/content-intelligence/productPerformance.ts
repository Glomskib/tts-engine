/**
 * Product Performance — aggregates post metrics by product and upserts
 * into the product_performance table. Called during metrics sync.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

const LOG = '[productPerformance]';

/**
 * Recompute product_performance rows for a workspace.
 *
 * For each product that has at least one content_item_post with metrics,
 * we compute:
 *   - total_posts: count of posts linked to the product
 *   - avg_views: average views across latest snapshots
 *   - avg_engagement: average engagement rate ((likes+comments+shares)/views*100)
 *   - top_post_id: post with highest engagement rate
 */
export async function updateProductPerformance(workspaceId: string): Promise<void> {
  // Get all posts with a product_id for this workspace, plus their latest metrics
  const { data: posts, error: postsErr } = await supabaseAdmin
    .from('content_item_posts')
    .select('id, product_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .not('product_id', 'is', null);

  if (postsErr || !posts?.length) return;

  // Get latest metrics snapshot per post
  const postIds = posts.map(p => p.id);
  const { data: snapshots } = await supabaseAdmin
    .from('content_item_metrics_snapshots')
    .select('content_item_post_id, views, likes, comments, shares, captured_at')
    .eq('workspace_id', workspaceId)
    .in('content_item_post_id', postIds)
    .order('captured_at', { ascending: false });

  if (!snapshots?.length) return;

  // Dedupe to latest snapshot per post
  const latestByPost = new Map<string, typeof snapshots[0]>();
  for (const s of snapshots) {
    if (!latestByPost.has(s.content_item_post_id)) {
      latestByPost.set(s.content_item_post_id, s);
    }
  }

  // Group by product
  const productMap = new Map<string, {
    postIds: string[];
    totalViews: number;
    totalEngRate: number;
    withViews: number;
    topPostId: string | null;
    topEngRate: number;
  }>();

  for (const post of posts) {
    if (!post.product_id) continue;
    const metrics = latestByPost.get(post.id);

    let entry = productMap.get(post.product_id);
    if (!entry) {
      entry = { postIds: [], totalViews: 0, totalEngRate: 0, withViews: 0, topPostId: null, topEngRate: 0 };
      productMap.set(post.product_id, entry);
    }
    entry.postIds.push(post.id);

    if (metrics && metrics.views && metrics.views > 0) {
      const likes = metrics.likes ?? 0;
      const comments = metrics.comments ?? 0;
      const shares = metrics.shares ?? 0;
      const engRate = ((likes + comments + shares) / metrics.views) * 100;

      entry.totalViews += metrics.views;
      entry.totalEngRate += engRate;
      entry.withViews++;

      if (engRate > entry.topEngRate) {
        entry.topEngRate = engRate;
        entry.topPostId = post.id;
      }
    }
  }

  // Upsert rows
  const rows = Array.from(productMap.entries()).map(([productId, data]) => ({
    workspace_id: workspaceId,
    product_id: productId,
    total_posts: data.postIds.length,
    avg_views: data.withViews > 0 ? Math.round(data.totalViews / data.withViews) : 0,
    avg_engagement: data.withViews > 0
      ? Math.round((data.totalEngRate / data.withViews) * 100) / 100
      : 0,
    top_post_id: data.topPostId,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length === 0) return;

  const { error } = await supabaseAdmin
    .from('product_performance')
    .upsert(rows, { onConflict: 'workspace_id,product_id' });

  if (error) {
    console.error(`${LOG} upsert error for workspace ${workspaceId}:`, error);
  }
}
