/**
 * Run-source detection utility.
 *
 * Determines how a job was triggered:
 *   - vercel_cron: Vercel cron schedule (CRON_SECRET header)
 *   - launchd:     macOS launchd plist (FF_RUN_SOURCE=launchd)
 *   - openclaw:    OpenClaw agent dispatch (--source openclaw or x-run-source header)
 *   - dispatch:    Admin dispatch API (x-run-source: dispatch)
 *   - manual:      Fallback (human ran the script directly)
 */

export type RunSource = 'vercel_cron' | 'launchd' | 'openclaw' | 'dispatch' | 'manual';

/**
 * Detect run source for CLI scripts.
 *
 * Priority:
 *   1. --source <value> CLI arg
 *   2. FF_RUN_SOURCE env var (set by shell wrappers)
 *   3. 'manual' fallback
 */
export function detectRunSource(args: string[] = process.argv.slice(2)): RunSource {
  // 1. CLI arg: --source openclaw
  const srcIdx = args.indexOf('--source');
  if (srcIdx !== -1 && srcIdx + 1 < args.length) {
    return normalizeSource(args[srcIdx + 1]);
  }

  // 2. Env var (set by launchd wrappers)
  const envSource = process.env.FF_RUN_SOURCE;
  if (envSource) {
    return normalizeSource(envSource);
  }

  // 3. Default
  return 'manual';
}

/**
 * Detect run source for API route handlers.
 *
 * Priority:
 *   1. x-run-source header (set by dispatch API or OpenClaw)
 *   2. CRON_SECRET auth match → vercel_cron
 *   3. 'manual' fallback
 */
export function detectRunSourceFromRequest(request: Request): RunSource {
  const header = request.headers.get('x-run-source');
  if (header) {
    return normalizeSource(header);
  }

  // If authenticated via CRON_SECRET, it's a Vercel cron invocation
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return 'vercel_cron';
  }

  return 'manual';
}

/**
 * Extract requested_by from CLI args or env.
 * Returns the value of --requested-by <value> or FF_REQUESTED_BY env, or null.
 */
export function detectRequestedBy(args: string[] = process.argv.slice(2)): string | null {
  const idx = args.indexOf('--requested-by');
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return process.env.FF_REQUESTED_BY ?? null;
}

function normalizeSource(raw: string): RunSource {
  const lower = raw.toLowerCase().trim();
  if (lower === 'vercel_cron' || lower === 'vercel-cron') return 'vercel_cron';
  if (lower === 'launchd') return 'launchd';
  if (lower === 'openclaw') return 'openclaw';
  if (lower === 'dispatch') return 'dispatch';
  return 'manual';
}
