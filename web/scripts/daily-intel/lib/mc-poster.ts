/**
 * Post documents to Mission Control.
 * Uses /api/documents endpoint with Bearer token auth.
 * Token env vars: MC_API_TOKEN or MISSION_CONTROL_TOKEN (fallback).
 */

const MC_BASE_URL_DEFAULT = 'http://127.0.0.1:3100';

interface MCPostResult {
  ok: boolean;
  id?: string;
  error?: string;
}

function getMCBaseUrl(): string {
  return process.env.MC_BASE_URL || MC_BASE_URL_DEFAULT;
}

function getMCToken(): string | null {
  return process.env.MC_API_TOKEN
    || process.env.MISSION_CONTROL_TOKEN
    || process.env.MISSION_CONTROL_AGENT_TOKEN
    || null;
}

/**
 * Post a document to Mission Control.
 */
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
    console.warn('[daily-intel:mc] No MC token found (MC_API_TOKEN / MISSION_CONTROL_TOKEN) — skipping');
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
      console.error(`[daily-intel:mc] POST /api/documents failed: ${res.status} ${text}`);
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }

    const json = await res.json();
    return { ok: true, id: json.id ?? json.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[daily-intel:mc] Exception posting to MC:', message);
    return { ok: false, error: message };
  }
}
