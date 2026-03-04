/**
 * LateService — Wrapper around the Late.dev CLI for social media scheduling.
 * Replaces the old Buffer integration with Late CLI calls.
 *
 * Guarded behind LATE_API_KEY — skips silently if unset.
 * Supports dry-run mode via LATE_DRY_RUN=true env var.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  LateCreateRequest,
  LateCreateResponse,
  LateAccountHealth,
  LateServiceResult,
  PlatformTarget,
} from './types';
import { resolveTargets } from './brand-accounts';

const execFileAsync = promisify(execFile);

const LOG_PREFIX = '[marketing:late]';

function getApiKey(): string | null {
  const key = process.env.LATE_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

function isDryRun(): boolean {
  return process.env.LATE_DRY_RUN === 'true';
}

/**
 * Check if Late.dev is configured and ready.
 */
export function isConfigured(): boolean {
  return getApiKey() !== null;
}

/**
 * Run a Late CLI command and return parsed JSON output.
 */
async function runLateCli(
  args: string[],
  timeoutMs = 30_000,
): Promise<LateServiceResult<unknown>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, error: 'LATE_API_KEY not configured' };
  }

  try {
    const { stdout, stderr } = await execFileAsync('late', args, {
      timeout: timeoutMs,
      env: { ...process.env, LATE_API_KEY: apiKey },
      maxBuffer: 2 * 1024 * 1024,
    });

    if (stderr && stderr.trim()) {
      console.warn(`${LOG_PREFIX} stderr:`, stderr.trim());
    }

    // Try to parse as JSON first
    try {
      const data = JSON.parse(stdout.trim());
      return { ok: true, data };
    } catch {
      // Not JSON — return raw output
      return { ok: true, data: stdout.trim() };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} CLI error:`, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Create a post via Late CLI or API.
 * In dry-run mode, logs the request and returns a fake post ID.
 */
export async function createPost(req: LateCreateRequest): Promise<LateCreateResponse> {
  if (!isConfigured()) {
    return { ok: false, error: 'LATE_API_KEY not configured' };
  }

  if (isDryRun()) {
    console.log(`${LOG_PREFIX} [DRY RUN] Would create post:`, JSON.stringify(req, null, 2));
    return { ok: true, postId: `dry-run-${Date.now()}` };
  }

  const apiKey = getApiKey()!;
  const body: Record<string, unknown> = {
    content: req.content,
    publishNow: req.publishNow ?? false,
    platforms: req.platforms.map((p) => ({
      platform: p.platform,
      accountId: p.accountId,
      ...(p.platformSpecificData ? { platformSpecificData: p.platformSpecificData } : {}),
    })),
  };

  if (req.mediaItems && req.mediaItems.length > 0) {
    body.mediaItems = req.mediaItems;
  }

  try {
    const res = await fetch('https://getlate.dev/api/v1/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`${LOG_PREFIX} POST /posts failed: HTTP ${res.status} ${text.slice(0, 200)}`);
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json();
    return { ok: true, postId: data.id || data.postId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} createPost error:`, msg);
    return { ok: false, error: msg };
  }
}

/**
 * List connected accounts and their health.
 */
export async function getAccountsHealth(): Promise<LateServiceResult<LateAccountHealth[]>> {
  const result = await runLateCli(['accounts:health', '--json']);
  if (!result.ok) return { ok: false, error: result.error };

  // Parse health data from CLI output
  const raw = result.data;
  if (Array.isArray(raw)) {
    const accounts: LateAccountHealth[] = raw.map((a: Record<string, unknown>) => ({
      accountId: String(a.accountId || a.id || ''),
      platform: String(a.platform || ''),
      displayName: String(a.displayName || a.name || ''),
      healthy: Boolean(a.healthy ?? a.connected ?? true),
    }));
    return { ok: true, data: accounts };
  }

  return { ok: true, data: [] };
}

/**
 * Get analytics for a platform and date range.
 */
export async function getAnalytics(
  platform: string,
  fromDate: string,
  toDate: string,
): Promise<LateServiceResult<unknown>> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: 'LATE_API_KEY not configured' };

  try {
    const url = new URL('https://getlate.dev/api/v1/analytics');
    url.searchParams.set('platform', platform);
    url.searchParams.set('fromDate', fromDate);
    url.searchParams.set('toDate', toDate);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Push social drafts to Late — drop-in replacement for pushToBuffer().
 * Accepts the same SocialDraft[] format used by the daily-intel pipeline.
 * Uses brand-accounts resolution instead of hardcoded IDs.
 */
export async function pushDrafts(
  drafts: Array<{ platform: string; content: string }>,
  opts?: { brand?: string; targetPlatforms?: PlatformTarget[] },
): Promise<{ ok: boolean; pushed: number; errors: string[] }> {
  if (!isConfigured()) {
    return { ok: false, pushed: 0, errors: [] };
  }

  const errors: string[] = [];
  let pushed = 0;

  // Resolve targets once for the batch
  const platforms: PlatformTarget[] = opts?.targetPlatforms ||
    await resolveTargets(opts?.brand || 'Making Miles Matter');

  for (const draft of drafts) {
    const result = await createPost({
      content: draft.content,
      platforms,
      publishNow: false,
    });

    if (result.ok) {
      pushed++;
    } else {
      errors.push(`Late ${draft.platform}: ${result.error}`);
    }
  }

  return { ok: errors.length === 0, pushed, errors };
}
