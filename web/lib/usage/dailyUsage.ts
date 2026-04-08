/**
 * Daily usage tracking + soft quotas for FlashFlow Phase 3.
 *
 * Admins and users on "pro"/"team"/"scale" plans are unlimited. Free tier
 * has soft caps that trigger the existing UpgradeModal via `{ upgrade: true }`
 * responses from the API.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type UsageKind = 'scripts_generated' | 'pipeline_items' | 'renders';

export interface DailyUsage {
  scripts_generated: number;
  pipeline_items: number;
  renders: number;
}

const EMPTY: DailyUsage = { scripts_generated: 0, pipeline_items: 0, renders: 0 };

export interface DailyLimits {
  scripts_generated: number | null; // null = unlimited
  pipeline_items: number | null;
  renders: number | null;
}

function limitsForPlan(plan: string): DailyLimits {
  const p = (plan || 'free').toLowerCase();
  if (p === 'admin' || p === 'pro' || p === 'team' || p === 'scale') {
    return { scripts_generated: null, pipeline_items: null, renders: null };
  }
  // Free tier soft limits
  return { scripts_generated: 10, pipeline_items: 10, renders: 3 };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyUsage(userId: string): Promise<DailyUsage> {
  const { data } = await supabaseAdmin
    .from('daily_usage')
    .select('scripts_generated, pipeline_items, renders')
    .eq('user_id', userId)
    .eq('usage_date', today())
    .maybeSingle();
  if (!data) return { ...EMPTY };
  return {
    scripts_generated: data.scripts_generated ?? 0,
    pipeline_items: data.pipeline_items ?? 0,
    renders: data.renders ?? 0,
  };
}

export async function incrementUsage(userId: string, kind: UsageKind): Promise<void> {
  const current = await getDailyUsage(userId);
  const next = { ...current, [kind]: (current[kind] ?? 0) + 1 };
  await supabaseAdmin
    .from('daily_usage')
    .upsert(
      {
        user_id: userId,
        usage_date: today(),
        ...next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,usage_date' },
    );
}

async function getPlan(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.plan_id || 'free';
}

export interface DailyLimitCheck {
  allowed: boolean;
  limit: number | null;
  used: number;
  plan: string;
}

/**
 * Enforce the soft daily cap for a given usage kind.
 * Admins always pass.
 */
export async function checkDailyLimit(
  userId: string,
  isAdmin: boolean,
  kind: UsageKind,
): Promise<DailyLimitCheck> {
  if (isAdmin) {
    return { allowed: true, limit: null, used: 0, plan: 'admin' };
  }
  const [plan, usage] = await Promise.all([getPlan(userId), getDailyUsage(userId)]);
  const limits = limitsForPlan(plan);
  const limit = limits[kind];
  const used = usage[kind] ?? 0;
  if (limit === null) return { allowed: true, limit: null, used, plan };
  return { allowed: used < limit, limit, used, plan };
}
