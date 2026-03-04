/**
 * Hourly volume cap for auto-drafts.
 *
 * Prevents runaway AI spend by limiting how many auto-drafts
 * can be generated in a rolling 1-hour window.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

const TAG = '[cost-caps]';

export interface CapStatus {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
}

/**
 * Count auto-draft rows created within a time window.
 */
export async function getRecentAutoDraftCount(windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString();

  const { count, error } = await supabaseAdmin
    .from('ri_reply_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'ri')
    .gte('created_at', since);

  if (error) {
    console.error(`${TAG} getRecentAutoDraftCount failed:`, error.message);
    // Fail open — don't block drafts on a DB error
    return 0;
  }

  return count ?? 0;
}

/**
 * Check whether the hourly auto-draft cap allows more drafts.
 */
export async function checkHourlyCap(): Promise<CapStatus> {
  const limit = parseInt(process.env.RI_MAX_AI_DRAFTS_PER_HOUR ?? '20', 10);
  const effectiveLimit = Number.isFinite(limit) && limit >= 0 ? limit : 20;

  try {
    const current = await getRecentAutoDraftCount(60 * 60 * 1000);
    const remaining = Math.max(0, effectiveLimit - current);

    return {
      allowed: current < effectiveLimit,
      current,
      limit: effectiveLimit,
      remaining,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${TAG} checkHourlyCap error (fail-open):`, msg);
    // Fail open
    return { allowed: true, current: 0, limit: effectiveLimit, remaining: effectiveLimit };
  }
}
