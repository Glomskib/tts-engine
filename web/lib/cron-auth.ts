/**
 * Shared cron auth — extracted from video-engine-tick after the 2026-06
 * "publishing crons 401 every morning" incident.
 *
 * BACKGROUND (the 401 incident):
 *   hhh-daily-content (and friends) gated on `x-vercel-cron === '1'`. Vercel
 *   does NOT send that header. It sends:
 *     - `authorization: Bearer <CRON_SECRET>`  (only when CRON_SECRET exists in
 *       the Production env at deploy time)
 *     - user-agent `vercel-cron/1.0`
 *   So the daily HHH/MMM Facebook draft cron returned 401 every single morning
 *   and no draft was ever written. video-engine-tick already had the correct,
 *   battle-tested check inline — this module lifts it so every cron shares one
 *   source of truth and the divergence can't silently creep back.
 *
 * Use `authorizedCron(request)` for the normal (idempotent) cron path.
 * Use `authorizedBySecret(request)` directly when guarding a PRIVILEGED action
 *   (e.g. ?force_id) that the spoofable UA fallback must NOT unlock.
 */

/** Minimal shape we need — works for both `Request` and `NextRequest`. */
type HeaderBearer = {
  headers: { get(name: string): string | null };
  url: string;
};

/**
 * Strict secret auth. Accepts the secret via, in priority order:
 *   1. `authorization: Bearer <CRON_SECRET>`  — Vercel cron's automatic form
 *   2. `x-cron-secret: <CRON_SECRET>`          — back-compat manual/curl form
 *   3. `?secret=<CRON_SECRET>`                  — back-compat query form
 *
 * trim() everywhere: env vars pasted into the Vercel dashboard routinely pick
 * up a trailing newline; an exact compare then fails forever and silently —
 * which is exactly how the 401 incident hid for so long.
 */
export function authorizedBySecret(request: HeaderBearer): boolean {
  const secret = (process.env.CRON_SECRET ?? '').trim();
  if (!secret) return process.env.NODE_ENV === 'development'; // unauth only in local dev
  const auth = (request.headers.get('authorization') ?? '').trim();
  if (auth === `Bearer ${secret}`) return true;
  if ((request.headers.get('x-cron-secret') ?? '').trim() === secret) return true;
  try {
    const qsSecret = new URL(request.url).searchParams.get('secret');
    if (qsSecret && qsSecret.trim() === secret) return true;
  } catch {
    /* request.url not absolute (shouldn't happen in route handlers) — ignore */
  }
  return false;
}

/**
 * Looks like a Vercel cron invocation. The UA is spoofable, so callers should
 * only use this to unlock NON-privileged, idempotent work. It keeps crons
 * running even if the CRON_SECRET binding breaks again (the 401 incident).
 */
export function isVercelCron(request: HeaderBearer): boolean {
  if (request.headers.get('x-vercel-cron')) return true; // in case Vercel ever sends it
  return (request.headers.get('user-agent') ?? '').startsWith('vercel-cron/');
}

/** Standard cron gate: real secret OR a Vercel-cron-shaped request. */
export function authorizedCron(request: HeaderBearer): boolean {
  return authorizedBySecret(request) || isVercelCron(request);
}
