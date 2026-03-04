/**
 * Content Intelligence Analyzer
 *
 * Detects winning content patterns from posts, hooks, and performance data.
 * Pure database queries — no AI calls.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface ContentInsight {
  type: 'top_hook' | 'best_product' | 'best_time' | 'replication';
  title: string;
  message: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface ContentIntelligence {
  insights: ContentInsight[];
  top_hook: string | null;
  best_product: string | null;
  best_time: string | null;
  replication_suggestion: string | null;
}

export async function analyzeContent(workspaceId: string): Promise<ContentIntelligence> {
  const insights: ContentInsight[] = [];

  const [hooksResult, postsResult, productsResult] = await Promise.all([
    // Top hooks
    supabaseAdmin
      .from('hook_patterns')
      .select('pattern, example_hook, performance_score, uses_count')
      .eq('workspace_id', workspaceId)
      .gt('uses_count', 0)
      .order('performance_score', { ascending: false })
      .limit(10),

    // Recent posts with metrics
    supabaseAdmin
      .from('content_item_posts')
      .select('id, posted_at, performance_score, product_id, content_item_id')
      .eq('workspace_id', workspaceId)
      .eq('status', 'posted')
      .order('posted_at', { ascending: false })
      .limit(50),

    // Products
    supabaseAdmin
      .from('products')
      .select('id, name')
      .eq('user_id', workspaceId),
  ]);

  const hooks = hooksResult.data || [];
  const posts = postsResult.data || [];
  const products = productsResult.data || [];
  const productMap = new Map(products.map((p: any) => [p.id, p.name]));

  // Top hook insight
  let topHook: string | null = null;
  if (hooks.length >= 2) {
    const best = hooks[0] as any;
    const avgScore = hooks.reduce((s: number, h: any) => s + (h.performance_score || 0), 0) / hooks.length;
    if (best.performance_score > avgScore * 1.2) {
      topHook = best.example_hook || best.pattern;
      const multiplier = avgScore > 0 ? (best.performance_score / avgScore).toFixed(1) : '?';
      insights.push({
        type: 'top_hook',
        title: 'Winning Hook Pattern',
        message: `Videos using "${topHook}" outperform others by ${multiplier}x.`,
        score: best.performance_score,
        metadata: { hook: topHook, multiplier },
      });
    }
  }

  // Best product insight
  let bestProduct: string | null = null;
  if (posts.length > 0) {
    const productScores: Record<string, { total: number; count: number }> = {};
    for (const p of posts) {
      const pid = (p as any).product_id;
      if (!pid) continue;
      if (!productScores[pid]) productScores[pid] = { total: 0, count: 0 };
      productScores[pid].total += (p as any).performance_score || 0;
      productScores[pid].count++;
    }
    const sorted = Object.entries(productScores)
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count));

    if (sorted.length >= 2) {
      const [bestId, bestStats] = sorted[0];
      const [, secondStats] = sorted[1];
      const bestAvg = bestStats.total / bestStats.count;
      const secondAvg = secondStats.total / secondStats.count;
      bestProduct = productMap.get(bestId) || null;
      if (bestProduct && secondAvg > 0) {
        const pct = Math.round(((bestAvg - secondAvg) / secondAvg) * 100);
        insights.push({
          type: 'best_product',
          title: 'Top Product',
          message: `${bestProduct} videos outperform the next best product by ${pct}%.`,
          score: bestAvg,
          metadata: { product: bestProduct, pct },
        });
      }
    }
  }

  // Best posting time insight
  let bestTime: string | null = null;
  if (posts.length >= 5) {
    const hourScores: Record<number, { total: number; count: number }> = {};
    for (const p of posts) {
      const postedAt = (p as any).posted_at;
      if (!postedAt) continue;
      const hour = new Date(postedAt).getHours();
      if (!hourScores[hour]) hourScores[hour] = { total: 0, count: 0 };
      hourScores[hour].total += (p as any).performance_score || 0;
      hourScores[hour].count++;
    }
    const sorted = Object.entries(hourScores)
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count));

    if (sorted.length > 0) {
      const bestHour = parseInt(sorted[0][0]);
      const ampm = bestHour >= 12 ? 'PM' : 'AM';
      const h12 = bestHour === 0 ? 12 : bestHour > 12 ? bestHour - 12 : bestHour;
      bestTime = `${h12}:00 ${ampm}`;
      insights.push({
        type: 'best_time',
        title: 'Best Posting Time',
        message: `Videos posted around ${bestTime} perform best in your workspace.`,
        score: sorted[0][1].total / sorted[0][1].count,
        metadata: { hour: bestHour, time: bestTime },
      });
    }
  }

  // Replication suggestion
  let replicationSuggestion: string | null = null;
  if (topHook && bestProduct) {
    replicationSuggestion = `Try filming a ${bestProduct} video using the "${topHook}" hook pattern.`;
    insights.push({
      type: 'replication',
      title: 'Replication Opportunity',
      message: replicationSuggestion,
      score: 0,
    });
  }

  return {
    insights,
    top_hook: topHook,
    best_product: bestProduct,
    best_time: bestTime,
    replication_suggestion: replicationSuggestion,
  };
}
