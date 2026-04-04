/**
 * Hook Extraction & Intelligence
 *
 * Extracts hooks from content items and saves high-performing ones
 * as winning_hooks linked to trend clusters.
 *
 * Hook sources (priority order):
 *   1. primary_hook field (explicitly set during creation)
 *   2. script_json.beats[0] (first beat of structured script)
 *   3. First sentence of script_text
 *   4. First sentence of caption
 *
 * Performance scoring uses the existing winners engine formula.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizeProductKey } from './clustering';
import { computePerformanceScore } from '@/lib/content-intelligence/winners/scoring';

// ── Types ───────────────────────────────────────────────────────────

export interface ExtractedHook {
  hookText: string;
  source: 'generated' | 'manual' | 'extracted';
}

interface ContentItemForHook {
  id: string;
  workspace_id: string;
  primary_hook: string | null;
  script_text: string | null;
  script_json: Record<string, unknown> | null;
  caption: string | null;
  title: string | null;
  product_id: string | null;
}

interface MetricsForScoring {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  completion_rate: number | null;
}

// ── Performance threshold ───────────────────────────────────────────
// Only hooks from content with performance_score >= this value are saved.
const WINNING_HOOK_THRESHOLD = 50;
const DEFAULT_MEDIAN_VIEWS = 1000; // fallback when no workspace data

// ── Hook extraction ─────────────────────────────────────────────────

/**
 * Extract hook text from a content item using all available sources.
 */
export function extractHook(item: ContentItemForHook): ExtractedHook | null {
  // 1. Explicit primary_hook
  if (item.primary_hook?.trim()) {
    return {
      hookText: item.primary_hook.trim(),
      source: 'generated',
    };
  }

  // 2. First beat from structured script
  if (item.script_json && typeof item.script_json === 'object') {
    const beats = (item.script_json as { beats?: Array<{ text?: string; line?: string }> }).beats;
    if (Array.isArray(beats) && beats.length > 0) {
      const firstBeat = beats[0];
      const beatText = firstBeat.text || firstBeat.line;
      if (beatText?.trim()) {
        return {
          hookText: beatText.trim(),
          source: 'extracted',
        };
      }
    }
  }

  // 3. First sentence of script_text
  if (item.script_text?.trim()) {
    const hook = extractFirstSentence(item.script_text);
    if (hook) {
      return { hookText: hook, source: 'extracted' };
    }
  }

  // 4. First sentence of caption
  if (item.caption?.trim()) {
    const hook = extractFirstSentence(item.caption);
    if (hook) {
      return { hookText: hook, source: 'extracted' };
    }
  }

  return null;
}

/**
 * Extract first sentence (up to 150 chars) from text.
 */
function extractFirstSentence(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Try first sentence
  const sentenceMatch = trimmed.match(/^[^.!?\n]+[.!?]/);
  if (sentenceMatch && sentenceMatch[0].length <= 150) {
    return sentenceMatch[0].trim();
  }

  // Fallback: first ~12 words
  const words = trimmed.split(/\s+/).slice(0, 12);
  const result = words.join(' ');
  return result.length > 5 ? result : null;
}

// ── Save winning hook ───────────────────────────────────────────────

/**
 * Check if a content item's hook qualifies as a winner and save it.
 * Called after performance metrics are available.
 */
export async function processWinningHook(
  contentItemId: string,
  metrics: MetricsForScoring,
): Promise<{ saved: boolean; hook?: string; score?: number }> {
  // Load content item
  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id, workspace_id, primary_hook, script_text, script_json, caption, title, product_id')
    .eq('id', contentItemId)
    .single();

  if (!item) {
    return { saved: false };
  }

  // Extract hook
  const extracted = extractHook(item as ContentItemForHook);
  if (!extracted) {
    return { saved: false };
  }

  // Compute performance score
  const score = computePerformanceScore(
    {
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      saves: metrics.saves,
      completion_rate: metrics.completion_rate,
    },
    DEFAULT_MEDIAN_VIEWS,
  );

  if (score < WINNING_HOOK_THRESHOLD) {
    return { saved: false };
  }

  // Resolve product name and cluster
  let productName: string | null = null;
  let normalizedKey: string | null = null;
  let clusterId: string | null = null;

  if (item.product_id) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name')
      .eq('id', item.product_id)
      .single();

    productName = product?.name ?? null;
    if (productName) {
      normalizedKey = normalizeProductKey(productName);

      const { data: cluster } = await supabaseAdmin
        .from('trend_clusters')
        .select('id')
        .eq('normalized_product_key', normalizedKey)
        .maybeSingle();

      clusterId = cluster?.id ?? null;
    }
  }

  // Check for duplicate hook on same content item
  const { data: existing } = await supabaseAdmin
    .from('winning_hooks')
    .select('id')
    .eq('content_item_id', contentItemId)
    .maybeSingle();

  if (existing) {
    // Update existing
    await supabaseAdmin
      .from('winning_hooks')
      .update({
        hook_text: extracted.hookText,
        hook_source: extracted.source,
        performance_score: score,
        views: metrics.views,
        likes: metrics.likes,
        engagement_rate: metrics.views > 0
          ? Number((((metrics.likes + metrics.comments + metrics.shares) / metrics.views) * 100).toFixed(3))
          : 0,
        trend_cluster_id: clusterId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Insert new
    await supabaseAdmin
      .from('winning_hooks')
      .insert({
        workspace_id: item.workspace_id,
        content_item_id: contentItemId,
        trend_cluster_id: clusterId,
        product_name: productName,
        normalized_product_key: normalizedKey,
        hook_text: extracted.hookText,
        hook_source: extracted.source,
        performance_score: score,
        views: metrics.views,
        likes: metrics.likes,
        engagement_rate: metrics.views > 0
          ? Number((((metrics.likes + metrics.comments + metrics.shares) / metrics.views) * 100).toFixed(3))
          : 0,
      });
  }

  // Update cluster best hook
  if (clusterId) {
    const { data: bestHook } = await supabaseAdmin
      .from('winning_hooks')
      .select('hook_text')
      .eq('trend_cluster_id', clusterId)
      .order('performance_score', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bestHook) {
      await supabaseAdmin
        .from('trend_clusters')
        .update({ community_best_hook: bestHook.hook_text })
        .eq('id', clusterId);
    }
  }

  return { saved: true, hook: extracted.hookText, score };
}

// ── Query winning hooks ─────────────────────────────────────────────

export interface WinningHookQuery {
  workspaceId: string;
  clusterId?: string;
  productKey?: string;
  minScore?: number;
  limit?: number;
  daysBack?: number;
}

export interface WinningHookRow {
  id: string;
  hook_text: string;
  hook_source: string;
  performance_score: number;
  views: number;
  likes: number;
  engagement_rate: number;
  product_name: string | null;
  trend_cluster_id: string | null;
  created_at: string;
}

export async function queryWinningHooks(
  query: WinningHookQuery,
): Promise<WinningHookRow[]> {
  let q = supabaseAdmin
    .from('winning_hooks')
    .select('id, hook_text, hook_source, performance_score, views, likes, engagement_rate, product_name, trend_cluster_id, created_at')
    .eq('workspace_id', query.workspaceId)
    .order('performance_score', { ascending: false })
    .limit(query.limit ?? 20);

  if (query.clusterId) {
    q = q.eq('trend_cluster_id', query.clusterId);
  }
  if (query.productKey) {
    q = q.eq('normalized_product_key', query.productKey);
  }
  if (query.minScore) {
    q = q.gte('performance_score', query.minScore);
  }
  if (query.daysBack) {
    const since = new Date(Date.now() - query.daysBack * 86400000).toISOString();
    q = q.gte('created_at', since);
  }

  const { data } = await q;
  return (data ?? []) as WinningHookRow[];
}
