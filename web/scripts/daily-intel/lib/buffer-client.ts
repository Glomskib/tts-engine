/**
 * Optional Buffer API client for scheduling social posts.
 * Guarded behind BUFFER_ACCESS_TOKEN — skips silently if unset.
 */

import type { SocialDraft } from './types';

const BUFFER_API_URL = 'https://api.bufferapp.com/1';

interface BufferResult {
  ok: boolean;
  pushed: number;
  errors: string[];
}

/**
 * Push social drafts to Buffer for scheduling.
 * Returns { ok: false } silently if BUFFER_ACCESS_TOKEN is not set.
 */
export async function pushToBuffer(drafts: SocialDraft[]): Promise<BufferResult> {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, pushed: 0, errors: [] };
  }

  const profileIds = (process.env.BUFFER_PROFILE_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  if (profileIds.length === 0) {
    console.warn('[daily-intel:buffer] BUFFER_ACCESS_TOKEN set but no BUFFER_PROFILE_IDS — skipping');
    return { ok: false, pushed: 0, errors: ['No profile IDs configured'] };
  }

  const errors: string[] = [];
  let pushed = 0;

  for (const draft of drafts) {
    for (const profileId of profileIds) {
      try {
        const res = await fetch(`${BUFFER_API_URL}/updates/create.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            access_token: token,
            profile_ids: profileId,
            text: draft.content,
            now: 'false',
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          errors.push(`Buffer ${draft.platform} (${profileId}): HTTP ${res.status} ${text}`);
        } else {
          pushed++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Buffer ${draft.platform} (${profileId}): ${msg}`);
      }
    }
  }

  return { ok: errors.length === 0, pushed, errors };
}
