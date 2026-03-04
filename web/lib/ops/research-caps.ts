/**
 * Research safety controls: rate limits, timeouts, and fail cooldowns.
 *
 * Prevents research jobs from destabilizing FlashFlow by enforcing:
 *   - Hourly rate cap (FF_RESEARCH_MAX_PER_HOUR, default 20)
 *   - Per-job runtime timeout (FF_RESEARCH_MAX_RUNTIME_SECONDS, default 120)
 *   - Fail cooldown (FF_RESEARCH_FAIL_COOLDOWN_MINUTES, default 30)
 *
 * All checks fail-open on DB errors — never block research on transient failures.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

const TAG = '[research-caps]';

// ── Rate limiting ────────────────────────────────────────────────────────────

export interface RateLimitStatus {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
}

/**
 * Count research jobs created within a time window.
 */
export async function getRecentResearchCount(windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString();

  try {
    const { count, error } = await supabaseAdmin
      .from('ff_research_jobs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since);

    if (error) {
      console.error(`${TAG} getRecentResearchCount failed:`, error.message);
      return 0; // fail-open
    }

    return count ?? 0;
  } catch (err) {
    console.error(`${TAG} getRecentResearchCount error:`, err);
    return 0; // fail-open
  }
}

/**
 * Check whether the hourly research rate cap allows more jobs.
 */
export async function checkResearchRateLimit(): Promise<RateLimitStatus> {
  const limit = parseInt(process.env.FF_RESEARCH_MAX_PER_HOUR ?? '20', 10);
  const effectiveLimit = Number.isFinite(limit) && limit >= 0 ? limit : 20;

  try {
    const current = await getRecentResearchCount(60 * 60 * 1000);
    const remaining = Math.max(0, effectiveLimit - current);

    return {
      allowed: current < effectiveLimit,
      current,
      limit: effectiveLimit,
      remaining,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${TAG} checkResearchRateLimit error (fail-open):`, msg);
    return { allowed: true, current: 0, limit: effectiveLimit, remaining: effectiveLimit };
  }
}

// ── Timeout wrapper ──────────────────────────────────────────────────────────

/**
 * Wrap an async function with a timeout. Rejects with 'TIMEOUT' error if exceeded.
 */
export function getMaxRuntimeMs(): number {
  const secs = parseInt(process.env.FF_RESEARCH_MAX_RUNTIME_SECONDS ?? '120', 10);
  return (Number.isFinite(secs) && secs > 0 ? secs : 120) * 1000;
}

export async function wrapWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs?: number,
): Promise<T> {
  const ms = timeoutMs ?? getMaxRuntimeMs();

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TIMEOUT: research job exceeded ${ms / 1000}s limit`));
    }, ms);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ── Fail cooldown ────────────────────────────────────────────────────────────

/**
 * Check if research is in a fail cooldown period.
 * If the most recent error is within the cooldown window, returns the error row.
 */
export async function checkFailCooldown(): Promise<{
  inCooldown: boolean;
  lastError: string | null;
  cooldownMinutes: number;
}> {
  const cooldownMinutes = parseInt(
    process.env.FF_RESEARCH_FAIL_COOLDOWN_MINUTES ?? '30',
    10,
  );
  const effectiveCooldown =
    Number.isFinite(cooldownMinutes) && cooldownMinutes >= 0 ? cooldownMinutes : 30;

  try {
    const cutoff = new Date(
      Date.now() - effectiveCooldown * 60 * 1000,
    ).toISOString();

    const { data, error } = await supabaseAdmin
      .from('ff_research_jobs')
      .select('error, created_at')
      .eq('status', 'error')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error(`${TAG} checkFailCooldown failed:`, error.message);
      return { inCooldown: false, lastError: null, cooldownMinutes: effectiveCooldown };
    }

    if (data && data.length > 0) {
      return {
        inCooldown: true,
        lastError: data[0].error,
        cooldownMinutes: effectiveCooldown,
      };
    }

    return { inCooldown: false, lastError: null, cooldownMinutes: effectiveCooldown };
  } catch (err) {
    console.error(`${TAG} checkFailCooldown error (fail-open):`, err);
    return { inCooldown: false, lastError: null, cooldownMinutes: effectiveCooldown };
  }
}
