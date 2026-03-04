/**
 * Late Client — Drop-in replacement for buffer-client.ts
 *
 * Same interface as the old Buffer client: pushToLate(drafts) → { ok, pushed, errors }
 * Uses brand-accounts resolution instead of hardcoded account IDs.
 *
 * NOTE: Daily-intel pipeline now uses queue.ts (enqueueBatch) instead of calling
 * this directly. This client is kept for any code that needs to push directly
 * to Late without going through the marketing_posts queue.
 */

import type { SocialDraft } from '../../scripts/daily-intel/lib/types';
import { createPost } from './late-service';
import { resolveTargets } from './brand-accounts';
import type { PlatformTarget, LatePlatform } from './types';

interface LateResult {
  ok: boolean;
  pushed: number;
  errors: string[];
}

/**
 * Push social drafts to Late for scheduling.
 * Drop-in replacement for pushToBuffer().
 * Returns { ok: false } silently if LATE_API_KEY is not set.
 */
export async function pushToLate(
  drafts: SocialDraft[],
  opts?: { brand?: string },
): Promise<LateResult> {
  const token = process.env.LATE_API_KEY;
  if (!token) {
    return { ok: false, pushed: 0, errors: [] };
  }

  if (drafts.length === 0) {
    return { ok: true, pushed: 0, errors: [] };
  }

  const brand = opts?.brand || 'Making Miles Matter';

  // Resolve all targets for this brand once
  const allTargets = await resolveTargets(brand);

  const errors: string[] = [];
  let pushed = 0;

  for (const draft of drafts) {
    // Try to match a specific platform from the draft; fall back to all brand targets
    const lower = draft.platform.toLowerCase() as LatePlatform;
    const platformTargets: PlatformTarget[] = allTargets.filter(
      (t) => t.platform === lower,
    );
    const targets = platformTargets.length > 0 ? platformTargets : allTargets;

    try {
      const result = await createPost({
        content: draft.content,
        platforms: targets,
        publishNow: false,
      });

      if (result.ok) {
        pushed++;
      } else {
        errors.push(`Late ${draft.platform}: ${result.error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Late ${draft.platform}: ${msg}`);
    }
  }

  return { ok: errors.length === 0, pushed, errors };
}
