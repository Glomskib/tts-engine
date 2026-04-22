import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveV1Tier, summarize, type UsageSnapshot } from './usage-limits';

async function fetchUserPlan(userId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id, status')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return null;
    const status = (data.status as string | null)?.toLowerCase();
    if (status && status !== 'active' && status !== 'trialing') return null;
    return (data.plan_id as string | null) ?? null;
  } catch {
    return null;
  }
}

function startOfTodayISO(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthISO(): string {
  const d = new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  return m.toISOString();
}

export async function getUsageSnapshot(userId: string): Promise<UsageSnapshot> {
  const planId = await fetchUserPlan(userId);
  const tier = resolveV1Tier(planId);

  const [dayRes, monthRes] = await Promise.all([
    supabaseAdmin
      .from('v1_generation_events')
      .select('clips_returned')
      .eq('user_id', userId)
      .gte('created_at', startOfTodayISO()),
    supabaseAdmin
      .from('v1_generation_events')
      .select('clips_returned')
      .eq('user_id', userId)
      .gte('created_at', startOfMonthISO()),
  ]);

  const usedToday = (dayRes.data || []).reduce((sum, r) => sum + (r.clips_returned || 0), 0);
  const usedThisMonth = (monthRes.data || []).reduce((sum, r) => sum + (r.clips_returned || 0), 0);

  return summarize(tier, usedToday, usedThisMonth);
}

export async function recordGeneration(
  userId: string,
  requested: number,
  returned: number,
  inputMode: string,
  source: 'llm' | 'fallback',
): Promise<void> {
  try {
    await supabaseAdmin.from('v1_generation_events').insert({
      user_id: userId,
      clips_requested: requested,
      clips_returned: returned,
      input_mode: inputMode,
      source,
    });
  } catch (err) {
    console.error('[v1-usage] failed to record generation event:', err);
  }
}
