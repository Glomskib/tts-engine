/**
 * Opportunity Radar — Velocity Engine
 *
 * Computes how quickly a product cluster is gaining signals.
 * Uses simple windowed counting — no AI/ML.
 *
 * Velocity = rate of signal accumulation over time.
 * Growth = acceleration (current window vs previous window).
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ── Types ───────────────────────────────────────────────────────────

export interface VelocityMetrics {
  /** Signals (times_seen sum) in the last 24 hours */
  signals_24h: number;
  /** Signals in the previous 24 hours (24-48h ago) */
  signals_prev_24h: number;
  /** Growth rate: (current - previous) / max(previous, 1) */
  growth_rate: number;
  /** Number of distinct creators with observations */
  creator_count: number;
  /** Number of distinct sources (openclaw, manual, import, etc.) */
  source_count: number;
  /** Most recent signal timestamp */
  last_signal_at: string | null;
  /** Oldest signal timestamp */
  first_signal_at: string | null;
  /** Hours since first signal (age of the cluster) */
  age_hours: number;
}

// ── Core Computation ────────────────────────────────────────────────

/**
 * Compute velocity metrics for a trend cluster.
 *
 * Uses the observation timestamps (last_seen_at) to count signals
 * in rolling windows. Each observation's times_seen represents
 * its total signal count; we use last_seen_at to determine recency.
 */
export async function computeVelocity(clusterId: string): Promise<VelocityMetrics> {
  const now = Date.now();
  const h24ago = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const h48ago = new Date(now - 48 * 60 * 60 * 1000).toISOString();

  // Get all observations linked to this cluster
  const { data: members, error } = await supabaseAdmin
    .from('trend_cluster_members')
    .select('observation:creator_product_observations(creator_id, first_seen_at, last_seen_at, times_seen, source)')
    .eq('trend_cluster_id', clusterId);

  if (error || !members) {
    return emptyMetrics();
  }

  const observations = members
    .map((m) => m.observation)
    .flat()
    .filter(Boolean) as Array<{
      creator_id: string;
      first_seen_at: string;
      last_seen_at: string;
      times_seen: number;
      source: string;
    }>;

  if (observations.length === 0) return emptyMetrics();

  // Count signals in windows based on last_seen_at
  let signals24h = 0;
  let signalsPrev24h = 0;

  for (const obs of observations) {
    const lastSeen = new Date(obs.last_seen_at).getTime();
    if (lastSeen >= new Date(h24ago).getTime()) {
      signals24h += obs.times_seen;
    } else if (lastSeen >= new Date(h48ago).getTime()) {
      signalsPrev24h += obs.times_seen;
    }
  }

  const uniqueCreators = new Set(observations.map((o) => o.creator_id));
  const uniqueSources = new Set(observations.map((o) => o.source));

  const firstSignal = observations.reduce((earliest, o) => {
    return o.first_seen_at < earliest ? o.first_seen_at : earliest;
  }, observations[0].first_seen_at);

  const lastSignal = observations.reduce((latest, o) => {
    return o.last_seen_at > latest ? o.last_seen_at : latest;
  }, observations[0].last_seen_at);

  const ageHours = Math.max(0, (now - new Date(firstSignal).getTime()) / (1000 * 60 * 60));
  const growthRate = signalsPrev24h > 0
    ? (signals24h - signalsPrev24h) / signalsPrev24h
    : signals24h > 0 ? 1 : 0; // First window = 100% growth if any signals

  return {
    signals_24h: signals24h,
    signals_prev_24h: signalsPrev24h,
    growth_rate: Math.round(growthRate * 100) / 100,
    creator_count: uniqueCreators.size,
    source_count: uniqueSources.size,
    last_signal_at: lastSignal,
    first_signal_at: firstSignal,
    age_hours: Math.round(ageHours * 10) / 10,
  };
}

/**
 * Compute velocity score (0-100) from velocity metrics.
 *
 * Components:
 *   signal_volume    (max 25): raw signal count in current window
 *   growth           (max 25): acceleration vs previous window
 *   creator_diversity(max 25): number of distinct creators
 *   freshness        (max 25): how recently signals arrived
 */
export function computeVelocityScore(metrics: VelocityMetrics): {
  score: number;
  components: {
    signal_volume: number;
    growth: number;
    creator_diversity: number;
    freshness: number;
  };
  explanation: string;
} {
  // ── Signal volume (max 25) ──
  let signalVolume: number;
  if (metrics.signals_24h >= 10) signalVolume = 25;
  else if (metrics.signals_24h >= 5) signalVolume = 20;
  else if (metrics.signals_24h >= 3) signalVolume = 15;
  else if (metrics.signals_24h >= 1) signalVolume = 8;
  else signalVolume = 0;

  // ── Growth (max 25) ──
  let growth: number;
  if (metrics.growth_rate >= 1.0) growth = 25;       // 100%+ growth
  else if (metrics.growth_rate >= 0.5) growth = 20;   // 50%+ growth
  else if (metrics.growth_rate >= 0.2) growth = 12;   // 20%+ growth
  else if (metrics.growth_rate > 0) growth = 5;       // Any positive growth
  else if (metrics.growth_rate === 0 && metrics.signals_24h > 0) growth = 3; // Steady
  else growth = 0;                                     // Declining or no signals

  // ── Creator diversity (max 25) ──
  let creatorDiversity: number;
  if (metrics.creator_count >= 5) creatorDiversity = 25;
  else if (metrics.creator_count >= 3) creatorDiversity = 20;
  else if (metrics.creator_count >= 2) creatorDiversity = 12;
  else if (metrics.creator_count >= 1) creatorDiversity = 5;
  else creatorDiversity = 0;

  // ── Freshness (max 25) ──
  let freshness: number;
  if (!metrics.last_signal_at) {
    freshness = 0;
  } else {
    const hoursSinceLastSignal = (Date.now() - new Date(metrics.last_signal_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastSignal <= 6) freshness = 25;
    else if (hoursSinceLastSignal <= 12) freshness = 20;
    else if (hoursSinceLastSignal <= 24) freshness = 15;
    else if (hoursSinceLastSignal <= 48) freshness = 8;
    else freshness = 2;
  }

  const score = Math.min(signalVolume + growth + creatorDiversity + freshness, 100);

  // Build explanation
  const parts: string[] = [];
  if (metrics.signals_24h > 0) {
    parts.push(`${metrics.signals_24h} signal${metrics.signals_24h > 1 ? 's' : ''} in last 24h`);
  }
  if (metrics.growth_rate > 0) {
    parts.push(`${Math.round(metrics.growth_rate * 100)}% growth vs prior day`);
  } else if (metrics.growth_rate < 0) {
    parts.push(`${Math.abs(Math.round(metrics.growth_rate * 100))}% decline vs prior day`);
  }
  if (metrics.creator_count > 1) {
    parts.push(`spotted by ${metrics.creator_count} creators`);
  }

  return {
    score,
    components: {
      signal_volume: signalVolume,
      growth,
      creator_diversity: creatorDiversity,
      freshness,
    },
    explanation: parts.join(' · ') || 'No recent signals',
  };
}

function emptyMetrics(): VelocityMetrics {
  return {
    signals_24h: 0,
    signals_prev_24h: 0,
    growth_rate: 0,
    creator_count: 0,
    source_count: 0,
    last_signal_at: null,
    first_signal_at: null,
    age_hours: 0,
  };
}
