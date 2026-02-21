/**
 * Mission Control posting for Daily Virals trending.
 * Reuses the same pattern as daily-intel/lib/mc-poster.ts.
 */

import type { MCPostResult } from './types';

const MC_BASE_URL_DEFAULT = 'http://127.0.0.1:3100';
const TAG = '[daily-virals:mc]';

function getMCBaseUrl(): string {
  return process.env.MC_BASE_URL || MC_BASE_URL_DEFAULT;
}

function getMCToken(): string | null {
  return process.env.MC_API_TOKEN
    || process.env.MISSION_CONTROL_TOKEN
    || process.env.MISSION_CONTROL_AGENT_TOKEN
    || null;
}

export async function postToMC(input: {
  title: string;
  content: string;
  category: string;
  lane: string;
  tags: string[];
}): Promise<MCPostResult> {
  const baseUrl = getMCBaseUrl();
  const token = getMCToken();

  if (!token) {
    console.warn(`${TAG} No MC token found — skipping`);
    return { ok: false, error: 'MC token not configured' };
  }

  try {
    const res = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: input.title,
        content: input.content,
        category: input.category,
        lane: input.lane,
        tags: input.tags.join(', '),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`${TAG} POST /api/documents failed: ${res.status} ${text}`);
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }

    const json = await res.json();
    return { ok: true, id: json.id ?? json.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${TAG} Exception posting to MC:`, message);
    return { ok: false, error: message };
  }
}

export async function postBlockedDoc(reason: string, instructions: string): Promise<MCPostResult> {
  const date = new Date().toISOString().slice(0, 10);
  const content = `# BLOCKED — Daily Virals Trending Scraper

**Date:** ${date}
**Reason:** ${reason}

## What Happened

The automated trending scraper was blocked during login. This typically means 2FA, CAPTCHA, or credential rotation is required.

## Next Steps

${instructions}

## How to Resume

1. Fix the blocking issue (see above)
2. Re-run: \`npm run trending:daily-virals\`
3. Or dry-run first: \`npm run trending:daily-virals -- --dry-run\`
`;

  return postToMC({
    title: `BLOCKED — Daily Virals Trending — ${date}`,
    content,
    category: 'drafts',
    lane: 'FlashFlow',
    tags: ['blocked', 'needs-input', 'daily-virals', date],
  });
}
