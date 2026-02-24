/**
 * @module flashflow/mission-control
 *
 * HTTP client for Mission Control with self-healing 401 handling.
 *
 * Token resolution (canonical order — NO legacy MC_API_TOKEN):
 *   1. MISSION_CONTROL_TOKEN       (preferred — matches Vercel env var name)
 *   2. MISSION_CONTROL_AGENT_TOKEN (fallback for agent-only deployments)
 *
 * Every request sends BOTH auth headers for maximum compatibility:
 *   - Authorization: Bearer <token>
 *   - x-service-token: <token>
 *
 * On any non-2xx: logs URL, status code, headers sent, first 80 chars of body.
 * On 401 specifically: calls /api/auth-check to diagnose, retries once,
 * and sends a Telegram alert if still failing.
 */

const MC_BASE_URL_DEFAULT = 'https://mc.flashflowai.com';

/** Which headers mcFetch sends on every request. */
const AUTH_HEADERS_SENT = ['Authorization: Bearer <token>', 'x-service-token: <token>'] as const;

// ── Token resolution ──────────────────────────────────────────────────────

function getMCBaseUrl(): string {
  return process.env.MC_BASE_URL || MC_BASE_URL_DEFAULT;
}

/**
 * Returns { token, source } — source is the env var name for debugging.
 * Chain: MISSION_CONTROL_TOKEN → MISSION_CONTROL_AGENT_TOKEN → null.
 * MC_API_TOKEN is intentionally excluded to prevent drift.
 */
function getMCTokenInfo(): { token: string | null; source: string } {
  if (process.env.MISSION_CONTROL_TOKEN) {
    return { token: process.env.MISSION_CONTROL_TOKEN, source: 'MISSION_CONTROL_TOKEN' };
  }
  if (process.env.MISSION_CONTROL_AGENT_TOKEN) {
    return { token: process.env.MISSION_CONTROL_AGENT_TOKEN, source: 'MISSION_CONTROL_AGENT_TOKEN' };
  }
  return { token: null, source: 'none' };
}

/** Build the auth headers object for a given token. Sends BOTH header styles. */
function buildAuthHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'x-service-token': token,
  };
}

// ── Debug state (exported for /debug command) ─────────────────────────────

let _lastAuthCheck: { status: number; ts: string; ok: boolean } | null = null;

export function getMCDebugState() {
  const { source } = getMCTokenInfo();
  return {
    baseUrl: getMCBaseUrl(),
    tokenEnvVar: source,
    headersSent: AUTH_HEADERS_SENT,
    envVarsPresent: {
      MISSION_CONTROL_TOKEN: !!process.env.MISSION_CONTROL_TOKEN,
      MISSION_CONTROL_AGENT_TOKEN: !!process.env.MISSION_CONTROL_AGENT_TOKEN,
      MC_API_TOKEN: !!process.env.MC_API_TOKEN,
    },
    lastAuthCheck: _lastAuthCheck,
  };
}

// ── Logging ───────────────────────────────────────────────────────────────

function logNon2xx(method: string, url: string, status: number, body: string, tokenSource: string) {
  const snippet = body.slice(0, 80).replace(/\n/g, ' ');
  console.error(
    `[ff:mc] ${method} ${url} → HTTP ${status}` +
    ` | headers=[Authorization: Bearer, x-service-token]` +
    ` | tokenSource=${tokenSource}` +
    ` | body=${snippet}`,
  );
}

// ── Telegram alert (fire-and-forget) ──────────────────────────────────────

function alertTelegram(msg: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' }),
  }).catch(() => {});
}

// ── Auth-check probe ──────────────────────────────────────────────────────

async function probeAuthCheck(token: string): Promise<number> {
  const baseUrl = getMCBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/auth-check`, {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(token),
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    _lastAuthCheck = { status: res.status, ts: new Date().toISOString(), ok: res.ok };
    return res.status;
  } catch {
    _lastAuthCheck = { status: 0, ts: new Date().toISOString(), ok: false };
    return 0;
  }
}

// ── Core fetch with 401 self-healing ──────────────────────────────────────

async function mcFetch(
  method: string,
  path: string,
  opts?: { body?: string; timeoutMs?: number },
): Promise<Response> {
  const baseUrl = getMCBaseUrl();
  const { token, source } = getMCTokenInfo();
  const url = `${baseUrl}${path}`;

  if (!token) {
    throw new Error('No MC token configured (set MISSION_CONTROL_TOKEN)');
  }

  const headers: Record<string, string> = {
    ...buildAuthHeaders(token),
  };
  if (opts?.body) headers['Content-Type'] = 'application/json';

  const doFetch = () =>
    fetch(url, {
      method,
      headers,
      body: opts?.body,
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 10000),
    });

  let res = await doFetch();

  // ── 401 self-healing ──────────────────────────────────────────────────
  if (res.status === 401) {
    const bodySnippet = await res.text().catch(() => '');
    logNon2xx(method, url, 401, bodySnippet, source);

    // Diagnose: does auth-check also fail?
    const authStatus = await probeAuthCheck(token);
    console.error(`[ff:mc] 401 self-diag: auth-check=${authStatus}, tokenSource=${source}, headers=[Bearer, x-service-token]`);

    if (authStatus === 401) {
      // Token is genuinely wrong on the server — alert
      alertTelegram(
        `⚠️ *MC Client 401*\n` +
        `• URL: \`${url}\`\n` +
        `• Headers sent: \`Authorization: Bearer\`, \`x-service-token\`\n` +
        `• Token source: \`${source}\`\n` +
        `• auth-check: HTTP ${authStatus}\n` +
        `• Action needed: token drift — watchdog should auto-fix`,
      );
    } else if (authStatus === 200) {
      // auth-check passed but the original call failed — retry once
      console.error('[ff:mc] auth-check passed but original call got 401 — retrying once');
      res = await doFetch();
      if (res.ok) {
        console.log('[ff:mc] Retry succeeded');
        return res;
      }
      const retryBody = await res.text().catch(() => '');
      logNon2xx(method, url, res.status, retryBody, source);
    }

    // Return the original failed response (caller handles it)
    return new Response(bodySnippet, { status: 401, headers: res.headers });
  }

  // ── Log other non-2xx ─────────────────────────────────────────────────
  if (!res.ok) {
    const bodySnippet = await res.clone().text().catch(() => '');
    logNon2xx(method, url, res.status, bodySnippet, source);
  }

  return res;
}

// ── Public API ────────────────────────────────────────────────────────────

interface MCDocInput {
  title: string;
  content: string;
  category?: string;
  lane?: string;
  tags?: string[];
}

interface MCDocResponse {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface MCPipelineHealth {
  ok: boolean;
  queued_count: number;
  executing_count: number;
  blocked_count: number;
  last_updated: string;
  error?: string;
}

const EMPTY_HEALTH: MCPipelineHealth = {
  ok: false, queued_count: 0, executing_count: 0, blocked_count: 0, last_updated: '',
};

export async function fetchMCPipelineHealth(): Promise<MCPipelineHealth> {
  try {
    const res = await mcFetch('GET', '/api/pipeline/health', { timeoutMs: 5000 });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ...EMPTY_HEALTH, error: `HTTP ${res.status}: ${text.slice(0, 80)}` };
    }

    const json = await res.json();
    return {
      ok: true,
      queued_count: json.queued_count ?? json.data?.queued_count ?? 0,
      executing_count: json.executing_count ?? json.data?.executing_count ?? 0,
      blocked_count: json.blocked_count ?? json.data?.blocked_count ?? 0,
      last_updated: json.last_updated ?? json.data?.last_updated ?? new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...EMPTY_HEALTH, error: message };
  }
}

export async function postMCDoc(input: MCDocInput): Promise<MCDocResponse> {
  try {
    const res = await mcFetch('POST', '/api/documents', {
      body: JSON.stringify({
        title: input.title,
        content: input.content,
        category: input.category ?? 'plans',
        lane: input.lane ?? 'FlashFlow',
        tags: Array.isArray(input.tags) ? input.tags.join(',') : (input.tags ?? ''),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 80)}` };
    }

    const json = await res.json();
    return { ok: true, id: json.id ?? json.data?.id };
  } catch (err) {
    const { source } = getMCTokenInfo();
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ff:mc] Exception posting to MC (token: ${source}):`, message);
    return { ok: false, error: message };
  }
}
