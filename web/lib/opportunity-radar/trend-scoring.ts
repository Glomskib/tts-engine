/**
 * Opportunity Radar — Trend Scoring Engine
 *
 * Separate from per-opportunity scoring. Answers:
 * "Is this product gaining momentum unusually quickly?"
 *
 * Deterministic, explainable, stored with reasons.
 *
 * Components (base sum to 100, community bonus can push higher):
 *   velocity          (max 30): how fast signals are accumulating
 *   clustering        (max 25): independent creator signals
 *   early_signal      (max 20): not-yet-posted advantage
 *   confirmation      (max 15): confidence-weighted signal strength
 *   recency           (max 10): freshness of the cluster
 *   community_bonus   (max 10): boost from community performance signals
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { computeVelocity, computeVelocityScore } from './velocity';
import type { VelocityMetrics } from './velocity';
import { refreshClusterMetrics } from './clustering';
import { forecastCluster } from './forecasting';
import { evaluateClusterAlerts, type ClusterSnapshot } from './alerts';

// ── Types ───────────────────────────────────────────────────────────

export interface TrendScoreBreakdown {
  velocity: number;
  clustering: number;
  early_signal: number;
  confirmation: number;
  recency: number;
  community_bonus: number;
  total: number;
  label: TrendLabel;
  reasons: string[];
  velocity_metrics: VelocityMetrics;
}

export type TrendLabel = 'hot' | 'rising' | 'warm' | 'cold';

// ── Core Scoring ────────────────────────────────────────────────────

/**
 * Compute the full trend score for a cluster.
 */
export async function computeTrendScore(clusterId: string): Promise<TrendScoreBreakdown> {
  // Refresh aggregate metrics first
  await refreshClusterMetrics(clusterId);

  // Get velocity metrics
  const velocityMetrics = await computeVelocity(clusterId);
  const velocityResult = computeVelocityScore(velocityMetrics);

  // Get cluster data for additional scoring
  const { data: cluster } = await supabaseAdmin
    .from('trend_clusters')
    .select('signal_count, creator_count, posted_creator_count, first_signal_at')
    .eq('id', clusterId)
    .single();

  if (!cluster) {
    return emptyScore(velocityMetrics);
  }

  // Get confidence distribution from linked observations
  const { data: members } = await supabaseAdmin
    .from('trend_cluster_members')
    .select('observation:creator_product_observations(confidence, creator_has_posted)')
    .eq('trend_cluster_id', clusterId);

  const observations = (members ?? [])
    .map((m) => m.observation)
    .flat()
    .filter(Boolean) as Array<{ confidence: string; creator_has_posted: boolean }>;

  const reasons: string[] = [];

  // ── 1. Velocity (max 30) ──────────────────────────────────────
  const velocity = Math.round((velocityResult.score / 100) * 30);
  if (velocityResult.explanation) {
    reasons.push(velocityResult.explanation);
  }

  // ── 2. Clustering / Creator Diversity (max 25) ────────────────
  let clustering: number;
  const creatorCount = cluster.creator_count || 0;
  if (creatorCount >= 5) {
    clustering = 25;
    reasons.push(`${creatorCount} independent creators — strong clustering`);
  } else if (creatorCount >= 3) {
    clustering = 20;
    reasons.push(`${creatorCount} creators confirming this product`);
  } else if (creatorCount >= 2) {
    clustering = 12;
    reasons.push('2 creators independently spotted this product');
  } else if (creatorCount >= 1) {
    clustering = 4;
  } else {
    clustering = 0;
  }

  // ── 3. Early Signal Advantage (max 20) ────────────────────────
  // Products not yet widely posted about are more valuable
  const postedCount = cluster.posted_creator_count || 0;
  const notPostedCount = observations.filter((o) => !o.creator_has_posted).length;
  let earlySignal: number;

  if (notPostedCount > 0 && postedCount === 0) {
    // All showcase-only, no one has posted yet — highest early signal
    earlySignal = 20;
    reasons.push('No creators have posted yet — early mover advantage');
  } else if (notPostedCount > postedCount) {
    earlySignal = 14;
    reasons.push('Most signals are pre-post — still early');
  } else if (notPostedCount > 0) {
    earlySignal = 7;
    reasons.push('Some pre-post signals remain');
  } else {
    earlySignal = 0;
  }

  // ── 4. Confirmation / Confidence (max 15) ─────────────────────
  const CONF_WEIGHTS: Record<string, number> = {
    confirmed: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  const totalConfWeight = observations.reduce((sum, o) => {
    return sum + (CONF_WEIGHTS[o.confidence] ?? 1);
  }, 0);

  const maxPossibleConf = observations.length * 4;
  const confRatio = maxPossibleConf > 0 ? totalConfWeight / maxPossibleConf : 0;

  let confirmation: number;
  if (confRatio >= 0.8) {
    confirmation = 15;
    reasons.push('High-confidence signals');
  } else if (confRatio >= 0.6) {
    confirmation = 11;
  } else if (confRatio >= 0.4) {
    confirmation = 7;
  } else {
    confirmation = 3;
  }

  // ── 5. Recency (max 10) ───────────────────────────────────────
  let recency: number;
  if (!cluster.first_signal_at) {
    recency = 0;
  } else {
    const ageDays = (Date.now() - new Date(cluster.first_signal_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 2) {
      recency = 10;
      reasons.push('Cluster emerged in the last 2 days');
    } else if (ageDays <= 7) {
      recency = 7;
    } else if (ageDays <= 14) {
      recency = 4;
    } else {
      recency = 1;
    }
  }

  // ── 6. Community Bonus (max 10) ──────────────────────────────
  // Boost from real user performance signals
  let communityBonus = 0;
  const { data: clusterCommunity } = await supabaseAdmin
    .from('trend_clusters')
    .select('community_wins, community_total_views')
    .eq('id', clusterId)
    .single();

  if (clusterCommunity) {
    const wins = clusterCommunity.community_wins || 0;
    const totalViews = clusterCommunity.community_total_views || 0;

    if (wins >= 3 || totalViews >= 100000) {
      communityBonus = 10;
      reasons.push(`Community momentum: ${wins} wins, ${formatViews(totalViews)} views`);
    } else if (wins >= 2 || totalViews >= 50000) {
      communityBonus = 7;
      reasons.push(`Community signal: ${wins} wins with ${formatViews(totalViews)} views`);
    } else if (wins >= 1) {
      communityBonus = 4;
      reasons.push('Community confirmation: 1 published video');
    }
  }

  const total = Math.min(velocity + clustering + earlySignal + confirmation + recency + communityBonus, 100);
  const label = trendLabel(total);

  return {
    velocity,
    clustering,
    early_signal: earlySignal,
    confirmation,
    recency,
    community_bonus: communityBonus,
    total,
    label,
    reasons,
    velocity_metrics: velocityMetrics,
  };
}

/**
 * Recompute and persist trend score for a cluster.
 * Returns the updated score.
 */
export async function rescoreCluster(clusterId: string): Promise<TrendScoreBreakdown> {
  const breakdown = await computeTrendScore(clusterId);

  const { error } = await supabaseAdmin
    .from('trend_clusters')
    .update({
      trend_score: breakdown.total,
      trend_label: breakdown.label,
      score_breakdown: breakdown,
      velocity_score: breakdown.velocity,
      signals_24h: breakdown.velocity_metrics.signals_24h,
      signals_prev_24h: breakdown.velocity_metrics.signals_prev_24h,
      // Auto-transition status based on trend
      ...(breakdown.label === 'hot' ? { status: 'hot' } : {}),
    })
    .eq('id', clusterId);

  if (error) {
    console.error('[trend-scoring] rescore update failed:', error.message);
  }

  // Recompute forecast after trend score update
  const forecast = await forecastCluster(clusterId);

  // Evaluate alerts after rescore + forecast
  if (forecast) {
    const { data: clusterData } = await supabaseAdmin
      .from('trend_clusters')
      .select('id, workspace_id, display_name, recommendation, trend_score, earlyness_score, saturation_score, velocity_score, community_wins, community_total_views, community_best_hook, signals_24h, signals_prev_24h')
      .eq('id', clusterId)
      .single();

    if (clusterData) {
      evaluateClusterAlerts(clusterData as ClusterSnapshot).catch(err => {
        console.error('[trend-scoring] alert evaluation failed (non-fatal):', err instanceof Error ? err.message : err);
      });
    }
  }

  return breakdown;
}

// ── Helpers ─────────────────────────────────────────────────────────

function trendLabel(score: number): TrendLabel {
  if (score >= 70) return 'hot';
  if (score >= 45) return 'rising';
  if (score >= 20) return 'warm';
  return 'cold';
}

function emptyScore(velocityMetrics: VelocityMetrics): TrendScoreBreakdown {
  return {
    velocity: 0,
    clustering: 0,
    early_signal: 0,
    confirmation: 0,
    recency: 0,
    community_bonus: 0,
    total: 0,
    label: 'cold',
    reasons: ['No signals yet'],
    velocity_metrics: velocityMetrics,
  };
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
