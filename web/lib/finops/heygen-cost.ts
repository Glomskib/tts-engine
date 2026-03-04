/**
 * HeyGen Cost Estimation
 *
 * HeyGen charges by credits-per-minute, not tokens.
 * This module provides credit-based cost estimation for HeyGen renders.
 *
 * Default rates (configurable via env vars):
 *   Engine III: 2 credits/min (digital twin)
 *   Engine IV:  6 credits/min
 *
 * Credit-to-USD conversion uses HEYGEN_USD_PER_CREDIT (default $0.50).
 */

export type HeyGenEngine = 'engine_iii' | 'engine_iv';

const DEFAULT_RATES: Record<HeyGenEngine, number> = {
  engine_iii: 2,
  engine_iv: 6,
};

function getCreditsPerMinute(engine: HeyGenEngine): number {
  if (engine === 'engine_iv') {
    return Number(process.env.ENGINE_IV_CREDITS_PER_MIN) || DEFAULT_RATES.engine_iv;
  }
  return Number(process.env.ENGINE_III_CREDITS_PER_MIN) || DEFAULT_RATES.engine_iii;
}

function getUsdPerCredit(): number {
  return Number(process.env.HEYGEN_USD_PER_CREDIT) || 0.50;
}

export interface HeyGenCostEstimate {
  credits_used: number;
  estimated_usd: number;
  engine: HeyGenEngine;
  duration_seconds: number;
  rate_credits_per_min: number;
  usd_per_credit: number;
}

/**
 * Estimate cost for a HeyGen video render.
 *
 * HeyGen bills in full-minute increments (rounds up).
 */
export function estimateHeyGenCost(input: {
  engine?: HeyGenEngine;
  durationSeconds: number;
}): HeyGenCostEstimate {
  const engine = input.engine ?? 'engine_iii';
  const rate = getCreditsPerMinute(engine);
  const usdPerCredit = getUsdPerCredit();

  // HeyGen bills per minute, rounded up
  const minutes = Math.ceil(input.durationSeconds / 60);
  const credits = minutes * rate;
  const estimatedUsd = Math.round(credits * usdPerCredit * 1_000_000) / 1_000_000;

  return {
    credits_used: credits,
    estimated_usd: estimatedUsd,
    engine,
    duration_seconds: input.durationSeconds,
    rate_credits_per_min: rate,
    usd_per_credit: usdPerCredit,
  };
}
