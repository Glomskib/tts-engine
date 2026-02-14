/**
 * Shared rate limiting for all transcriber features:
 * transcription, AI recommendations, and AI rewrite.
 *
 * All features share the same daily pool tracked in the transcribe_usage table.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type UsageType = 'transcription' | 'recommendation' | 'rewrite';

const TIER_LIMITS: Record<string, number> = {
  anon: 10,
  free: 50,
  creator_lite: 100,
  creator_pro: 250,
  brand: 500,
  agency: -1, // unlimited
};

export async function getLimitForUser(userId: string | null): Promise<number> {
  if (!userId) return TIER_LIMITS.anon;

  const { data } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data?.plan_id) return TIER_LIMITS.free;

  const planId = data.plan_id as string;
  for (const tier of Object.keys(TIER_LIMITS)) {
    if (tier !== 'anon' && tier !== 'free' && planId.includes(tier)) {
      return TIER_LIMITS[tier];
    }
  }
  return TIER_LIMITS.free;
}

export async function checkRateLimit(
  ip: string,
  userId: string | null
): Promise<{ allowed: boolean; remaining: number; limit: number; used: number }> {
  const limit = await getLimitForUser(userId);

  if (limit === -1) {
    return { allowed: true, remaining: -1, limit: -1, used: 0 };
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let query = supabaseAdmin
    .from('transcribe_usage')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());

  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('ip', ip).is('user_id', null);
  }

  const { count } = await query;
  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);

  return { allowed: used < limit, remaining, limit, used };
}

export async function recordUsage(
  ip: string,
  userId: string | null,
  usageType: UsageType,
  processingTimeMs: number,
  url?: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('transcribe_usage')
    .insert({
      ip,
      user_id: userId,
      url_transcribed: url || `ai_${usageType}`,
      processing_time_ms: processingTimeMs,
      usage_type: usageType,
    });

  if (error) console.warn(`[${usageType}] Failed to log usage:`, error.message);
}
