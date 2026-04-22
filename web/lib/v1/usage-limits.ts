export type V1Tier = 'free' | 'creator' | 'pro' | 'scale';

export interface V1Limits {
  tier: V1Tier;
  label: string;
  perDay: number | null;
  perMonth: number | null;
  batchMax: number;
}

export const V1_LIMITS: Record<V1Tier, V1Limits> = {
  free: { tier: 'free', label: 'Free', perDay: 5, perMonth: null, batchMax: 5 },
  creator: { tier: 'creator', label: 'Creator', perDay: null, perMonth: 50, batchMax: 10 },
  pro: { tier: 'pro', label: 'Pro', perDay: null, perMonth: 200, batchMax: 20 },
  scale: { tier: 'scale', label: 'Scale', perDay: null, perMonth: 500, batchMax: 20 },
};

export function resolveV1Tier(planId?: string | null): V1Tier {
  if (!planId) return 'free';
  const id = planId.toLowerCase();
  if (id.includes('agency') || id.includes('scale') || id.includes('business')) return 'scale';
  if (id.includes('pro')) return 'pro';
  if (id.includes('creator') || id.includes('starter')) return 'creator';
  return 'free';
}

export interface UsageSnapshot {
  tier: V1Tier;
  limits: V1Limits;
  usedToday: number;
  usedThisMonth: number;
  remainingToday: number | null;
  remainingThisMonth: number | null;
}

export function summarize(tier: V1Tier, usedToday: number, usedThisMonth: number): UsageSnapshot {
  const limits = V1_LIMITS[tier];
  return {
    tier,
    limits,
    usedToday,
    usedThisMonth,
    remainingToday: limits.perDay == null ? null : Math.max(0, limits.perDay - usedToday),
    remainingThisMonth: limits.perMonth == null ? null : Math.max(0, limits.perMonth - usedThisMonth),
  };
}

export interface GateResult {
  allowed: boolean;
  reason?: 'batch_too_large' | 'daily_cap' | 'monthly_cap';
  message?: string;
}

export function gateRequest(snapshot: UsageSnapshot, batchSize: number): GateResult {
  if (batchSize > snapshot.limits.batchMax) {
    return {
      allowed: false,
      reason: 'batch_too_large',
      message: `Your ${snapshot.limits.label} plan generates up to ${snapshot.limits.batchMax} clips per batch.`,
    };
  }
  if (snapshot.remainingToday != null && snapshot.remainingToday < batchSize) {
    return {
      allowed: false,
      reason: 'daily_cap',
      message: `You've used ${snapshot.usedToday}/${snapshot.limits.perDay} clips today.`,
    };
  }
  if (snapshot.remainingThisMonth != null && snapshot.remainingThisMonth < batchSize) {
    return {
      allowed: false,
      reason: 'monthly_cap',
      message: `You've used ${snapshot.usedThisMonth}/${snapshot.limits.perMonth} clips this month.`,
    };
  }
  return { allowed: true };
}
