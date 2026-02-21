/**
 * @module flashflow/mission-control
 *
 * Thin HTTP client for posting documents to Mission Control.
 * Uses MC_BASE_URL and MC_API_TOKEN from environment.
 *
 * Does NOT depend on the ~/.openclaw/bin/mc CLI.
 */

const MC_BASE_URL_DEFAULT = 'http://127.0.0.1:3100';

interface MCDocInput {
  title: string;
  content: string;
  category?: string;    // e.g. 'plans', 'notes', 'reports'
  lane?: string;        // e.g. 'FlashFlow'
  tags?: string[];
}

interface MCDocResponse {
  ok: boolean;
  id?: string;
  error?: string;
}

function getMCBaseUrl(): string {
  return process.env.MC_BASE_URL || MC_BASE_URL_DEFAULT;
}

function getMCToken(): string | null {
  return process.env.MC_API_TOKEN || null;
}

/**
 * Post a document to Mission Control.
 * Returns { ok, id } on success, { ok: false, error } on failure.
 */
export async function postMCDoc(input: MCDocInput): Promise<MCDocResponse> {
  const baseUrl = getMCBaseUrl();
  const token = getMCToken();

  if (!token) {
    console.warn('[ff:mc] MC_API_TOKEN not set — skipping Mission Control post');
    return { ok: false, error: 'MC_API_TOKEN not configured' };
  }

  try {
    const res = await fetch(`${baseUrl}/api/docs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: input.title,
        content: input.content,
        category: input.category ?? 'plans',
        lane: input.lane ?? 'FlashFlow',
        tags: input.tags ?? [],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[ff:mc] POST /api/docs failed: ${res.status} ${text}`);
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }

    const json = await res.json();
    return { ok: true, id: json.id ?? json.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ff:mc] Exception posting to MC:', message);
    return { ok: false, error: message };
  }
}
