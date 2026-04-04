/**
 * Opportunity Radar — Forecasting Engine
 *
 * Deterministic, explainable forecasting that answers:
 *   "Is this still early enough to act on?"
 *   "How saturated is this product already?"
 *   "Should I post now, watch, or skip?"
 *
 * Three outputs per cluster:
 *   1. Saturation Score (0–100): How crowded does this appear?
 *   2. Earlyness Score (0–100): How early are we in the growth cycle?
 *   3. Recommendation: ACT_NOW | TEST_SOON | WATCH | SKIP
 *
 * All logic is deterministic — no AI/ML.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ── Types ───────────────────────────────────────────────────────────

export type Recommendation = 'ACT_NOW' | 'TEST_SOON' | 'WATCH' | 'SKIP';

export interface ForecastBreakdown {
  saturation: {
    score: number;
    components: {
      creator_density: number;
      posted_ratio: number;
      signal_density: number;
      age_penalty: number;
      repeat_visibility: number;
    };
    reasons: string[];
  };
  earlyness: {
    score: number;
    components: {
      recency_bonus: number;
      low_creator_bonus: number;
      pre_post_advantage: number;
      growth_acceleration: number;
      low_saturation_bonus: number;
    };
    reasons: string[];
  };
  recommendation: Recommendation;
  recommendation_reason: string;
}

export interface ClusterForecastInput {
  creator_count: number;
  posted_creator_count: number;
  signal_count: number;
  signals_24h: number;
  signals_prev_24h: number;
  first_signal_at: string | null;
  last_signal_at: string | null;
  trend_score: number;
  velocity_score: number;
}

// ── Saturation Score (0–100) ────────────────────────────────────────
//
// "How crowded does this already appear?"
//
// Components (sum to 100):
//   creator_density     (max 30): how many independent creators
//   posted_ratio        (max 25): what % have already posted
//   signal_density      (max 20): raw signal volume
//   age_penalty         (max 15): older clusters = more saturated
//   repeat_visibility   (max 10): repeated observations = established product

export function computeSaturation(input: ClusterForecastInput): ForecastBreakdown['saturation'] {
  const reasons: string[] = [];

  // ── 1. Creator Density (max 30) ──
  let creatorDensity: number;
  if (input.creator_count >= 8) {
    creatorDensity = 30;
    reasons.push(`${input.creator_count} creators — heavily crowded`);
  } else if (input.creator_count >= 5) {
    creatorDensity = 24;
    reasons.push(`${input.creator_count} creators — getting crowded`);
  } else if (input.creator_count >= 3) {
    creatorDensity = 16;
    reasons.push(`${input.creator_count} creators — moderate competition`);
  } else if (input.creator_count >= 2) {
    creatorDensity = 8;
    reasons.push('2 creators — light competition');
  } else {
    creatorDensity = 0;
  }

  // ── 2. Posted Ratio (max 25) ──
  let postedRatio: number;
  const postRatio = input.creator_count > 0
    ? input.posted_creator_count / input.creator_count
    : 0;

  if (postRatio >= 0.8) {
    postedRatio = 25;
    reasons.push('Most creators already posting — high saturation');
  } else if (postRatio >= 0.5) {
    postedRatio = 18;
    reasons.push('Half of creators posting');
  } else if (postRatio > 0) {
    postedRatio = 8;
    reasons.push('Some creators posting');
  } else {
    postedRatio = 0;
  }

  // ── 3. Signal Density (max 20) ──
  let signalDensity: number;
  if (input.signal_count >= 20) {
    signalDensity = 20;
    reasons.push(`${input.signal_count} total signals — very established`);
  } else if (input.signal_count >= 10) {
    signalDensity = 14;
  } else if (input.signal_count >= 5) {
    signalDensity = 8;
  } else {
    signalDensity = 2;
  }

  // ── 4. Age Penalty (max 15) ──
  let agePenalty: number;
  if (!input.first_signal_at) {
    agePenalty = 0;
  } else {
    const ageDays = (Date.now() - new Date(input.first_signal_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays >= 30) {
      agePenalty = 15;
      reasons.push('Product spotted 30+ days ago — likely well-known');
    } else if (ageDays >= 14) {
      agePenalty = 10;
    } else if (ageDays >= 7) {
      agePenalty = 5;
    } else {
      agePenalty = 0;
    }
  }

  // ── 5. Repeat Visibility (max 10) ──
  let repeatVisibility: number;
  const avgSignalsPerCreator = input.creator_count > 0
    ? input.signal_count / input.creator_count
    : 0;
  if (avgSignalsPerCreator >= 5) {
    repeatVisibility = 10;
    reasons.push('High repeat visibility per creator');
  } else if (avgSignalsPerCreator >= 3) {
    repeatVisibility = 6;
  } else {
    repeatVisibility = 2;
  }

  const score = Math.min(creatorDensity + postedRatio + signalDensity + agePenalty + repeatVisibility, 100);

  return {
    score,
    components: {
      creator_density: creatorDensity,
      posted_ratio: postedRatio,
      signal_density: signalDensity,
      age_penalty: agePenalty,
      repeat_visibility: repeatVisibility,
    },
    reasons,
  };
}

// ── Earlyness Score (0–100) ─────────────────────────────────────────
//
// "How early are we relative to the likely growth cycle?"
//
// Components (sum to 100):
//   recency_bonus         (max 25): how recently the cluster appeared
//   low_creator_bonus     (max 25): fewer creators = earlier opportunity
//   pre_post_advantage    (max 20): showcase-before-posting signals
//   growth_acceleration   (max 15): rising fast = still early in cycle
//   low_saturation_bonus  (max 15): inverse of saturation

export function computeEarlyness(
  input: ClusterForecastInput,
  saturationScore: number,
): ForecastBreakdown['earlyness'] {
  const reasons: string[] = [];

  // ── 1. Recency Bonus (max 25) ──
  let recencyBonus: number;
  if (!input.first_signal_at) {
    recencyBonus = 25; // brand new
    reasons.push('Just appeared — maximum early advantage');
  } else {
    const ageDays = (Date.now() - new Date(input.first_signal_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 1) {
      recencyBonus = 25;
      reasons.push('Appeared in the last 24 hours');
    } else if (ageDays <= 3) {
      recencyBonus = 20;
      reasons.push('Appeared in the last 3 days');
    } else if (ageDays <= 7) {
      recencyBonus = 14;
      reasons.push('Appeared in the last week');
    } else if (ageDays <= 14) {
      recencyBonus = 7;
    } else {
      recencyBonus = 0;
    }
  }

  // ── 2. Low Creator Bonus (max 25) ──
  let lowCreatorBonus: number;
  if (input.creator_count <= 1) {
    lowCreatorBonus = 25;
    reasons.push('Only 1 creator — very early discovery');
  } else if (input.creator_count <= 2) {
    lowCreatorBonus = 20;
    reasons.push('Just 2 creators — still early');
  } else if (input.creator_count <= 3) {
    lowCreatorBonus = 12;
  } else if (input.creator_count <= 5) {
    lowCreatorBonus = 5;
  } else {
    lowCreatorBonus = 0;
  }

  // ── 3. Pre-Post Advantage (max 20) ──
  let prePostAdvantage: number;
  const notPostedCount = input.creator_count - input.posted_creator_count;
  if (input.posted_creator_count === 0 && input.creator_count > 0) {
    prePostAdvantage = 20;
    reasons.push('No creators have posted yet — full early mover advantage');
  } else if (notPostedCount > input.posted_creator_count) {
    prePostAdvantage = 14;
    reasons.push('Most creators haven\'t posted yet');
  } else if (notPostedCount > 0) {
    prePostAdvantage = 7;
  } else {
    prePostAdvantage = 0;
  }

  // ── 4. Growth Acceleration (max 15) ──
  let growthAcceleration: number;
  const growthRate = input.signals_prev_24h > 0
    ? (input.signals_24h - input.signals_prev_24h) / input.signals_prev_24h
    : input.signals_24h > 0 ? 1 : 0;

  if (growthRate >= 1.0 && input.signals_24h >= 2) {
    growthAcceleration = 15;
    reasons.push('Accelerating fast — catch it early');
  } else if (growthRate >= 0.5 && input.signals_24h >= 1) {
    growthAcceleration = 10;
    reasons.push('Strong growth trend');
  } else if (growthRate > 0) {
    growthAcceleration = 5;
  } else {
    growthAcceleration = 0;
  }

  // ── 5. Low Saturation Bonus (max 15) ──
  // Inverse of saturation: lower saturation = more early
  let lowSaturationBonus: number;
  if (saturationScore <= 15) {
    lowSaturationBonus = 15;
    reasons.push('Very low saturation — wide open opportunity');
  } else if (saturationScore <= 30) {
    lowSaturationBonus = 10;
  } else if (saturationScore <= 50) {
    lowSaturationBonus = 5;
  } else {
    lowSaturationBonus = 0;
  }

  const score = Math.min(
    recencyBonus + lowCreatorBonus + prePostAdvantage + growthAcceleration + lowSaturationBonus,
    100,
  );

  return {
    score,
    components: {
      recency_bonus: recencyBonus,
      low_creator_bonus: lowCreatorBonus,
      pre_post_advantage: prePostAdvantage,
      growth_acceleration: growthAcceleration,
      low_saturation_bonus: lowSaturationBonus,
    },
    reasons,
  };
}

// ── Recommendation ──────────────────────────────────────────────────
//
// Decision matrix based on earlyness + saturation + trend:
//
// ACT_NOW:    High earlyness + low saturation + rising/hot trend
// TEST_SOON:  Moderate earlyness + moderate saturation + some momentum
// WATCH:      Low earlyness or weak momentum
// SKIP:       High saturation + low earlyness + declining/cold

export function computeRecommendation(
  earlyness: number,
  saturation: number,
  trendScore: number,
  velocityScore: number,
): { recommendation: Recommendation; reason: string } {
  // ACT_NOW: early + unsaturated + momentum
  if (earlyness >= 60 && saturation <= 30 && trendScore >= 40) {
    return {
      recommendation: 'ACT_NOW',
      reason: 'Early opportunity with low saturation and strong momentum',
    };
  }

  // ACT_NOW: very early even with weaker trend
  if (earlyness >= 75 && saturation <= 20) {
    return {
      recommendation: 'ACT_NOW',
      reason: 'Very early discovery with minimal competition',
    };
  }

  // TEST_SOON: moderate early + moderate momentum
  if (earlyness >= 40 && saturation <= 50 && trendScore >= 30) {
    return {
      recommendation: 'TEST_SOON',
      reason: 'Growing opportunity with room to test',
    };
  }

  // TEST_SOON: hot trend but getting crowded
  if (trendScore >= 60 && saturation <= 60) {
    return {
      recommendation: 'TEST_SOON',
      reason: 'Hot trend — act quickly before saturation increases',
    };
  }

  // SKIP: highly saturated + not early + no velocity
  if (saturation >= 60 && earlyness <= 20 && velocityScore <= 20) {
    return {
      recommendation: 'SKIP',
      reason: 'Saturated market with no early advantage',
    };
  }

  // SKIP: very old + no momentum
  if (saturation >= 50 && earlyness <= 10) {
    return {
      recommendation: 'SKIP',
      reason: 'Late stage opportunity — likely oversaturated',
    };
  }

  // WATCH: everything else
  let reason = 'Monitoring — ';
  if (earlyness > saturation) {
    reason += 'signals emerging but not yet strong enough to act';
  } else if (trendScore >= 30) {
    reason += 'some momentum but competition is building';
  } else {
    reason += 'not enough signal to recommend action';
  }

  return { recommendation: 'WATCH', reason };
}

// ── Full Forecast ───────────────────────────────────────────────────

export function computeForecast(input: ClusterForecastInput): ForecastBreakdown {
  const saturation = computeSaturation(input);
  const earlyness = computeEarlyness(input, saturation.score);
  const { recommendation, reason } = computeRecommendation(
    earlyness.score,
    saturation.score,
    input.trend_score,
    input.velocity_score,
  );

  return {
    saturation,
    earlyness,
    recommendation,
    recommendation_reason: reason,
  };
}

// ── Persist ─────────────────────────────────────────────────────────

/**
 * Compute and persist forecast for a cluster.
 * Called after rescoreCluster() or on cron.
 */
export async function forecastCluster(clusterId: string): Promise<ForecastBreakdown | null> {
  const { data: cluster, error } = await supabaseAdmin
    .from('trend_clusters')
    .select('creator_count, posted_creator_count, signal_count, signals_24h, signals_prev_24h, first_signal_at, last_signal_at, trend_score, velocity_score')
    .eq('id', clusterId)
    .single();

  if (error || !cluster) {
    console.error('[forecasting] cluster lookup failed:', error?.message ?? 'not found');
    return null;
  }

  const forecast = computeForecast(cluster as ClusterForecastInput);

  const { error: updateErr } = await supabaseAdmin
    .from('trend_clusters')
    .update({
      saturation_score: forecast.saturation.score,
      earlyness_score: forecast.earlyness.score,
      recommendation: forecast.recommendation,
      forecast_breakdown: forecast,
      forecast_updated_at: new Date().toISOString(),
    })
    .eq('id', clusterId);

  if (updateErr) {
    console.error('[forecasting] update failed:', updateErr.message);
  }

  return forecast;
}
