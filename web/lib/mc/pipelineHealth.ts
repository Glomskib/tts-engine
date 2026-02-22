/**
 * @module mc/pipelineHealth
 *
 * Mission Control pipeline health adapter.
 * Tries /api/pipeline/health first, falls back to /api/tasks/summary.
 * 3-second timeout. Never throws — always returns a safe object.
 */

const MC_BASE_URL_DEFAULT = 'https://mc.flashflowai.com';
const TIMEOUT_MS = 3_000;

// ── Normalized output ───────────────────────────────────────────────────────

export interface PipelineHealthResult {
  queued: number;
  executing: number;
  blocked: number;
  lastUpdated: string;
}

const FALLBACK: PipelineHealthResult = {
  queued: 0,
  executing: 0,
  blocked: 0,
  lastUpdated: '',
};

// ── Internals ───────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return process.env.MC_BASE_URL || MC_BASE_URL_DEFAULT;
}

function getToken(): string | null {
  return process.env.MC_API_TOKEN || null;
}

async function fetchWithTimeout(url: string, token: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Try /api/pipeline/health and normalize.
 * Returns null if the endpoint is unavailable.
 */
async function tryPipelineHealth(
  baseUrl: string,
  token: string,
): Promise<PipelineHealthResult | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/pipeline/health`, token);
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.data ?? json;
    return {
      queued: d.queued_count ?? d.queued ?? 0,
      executing: d.executing_count ?? d.executing ?? 0,
      blocked: d.blocked_count ?? d.blocked ?? 0,
      lastUpdated: d.last_updated ?? d.lastUpdated ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Try /api/tasks/summary and normalize.
 * Returns null if the endpoint is unavailable.
 */
async function tryTasksSummary(
  baseUrl: string,
  token: string,
): Promise<PipelineHealthResult | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/tasks/summary`, token);
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.data ?? json;
    return {
      queued: d.queued_count ?? d.queued ?? d.pending ?? 0,
      executing: d.executing_count ?? d.executing ?? d.running ?? d.in_progress ?? 0,
      blocked: d.blocked_count ?? d.blocked ?? d.failed ?? 0,
      lastUpdated: d.last_updated ?? d.lastUpdated ?? d.timestamp ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch pipeline health from Mission Control.
 * Tries /api/pipeline/health, then /api/tasks/summary.
 * Never throws. Returns fallback if MC is offline or unconfigured.
 */
export async function fetchPipelineHealth(): Promise<PipelineHealthResult> {
  const token = getToken();
  if (!token) {
    console.warn('[mc:health] MC_API_TOKEN not set — returning fallback');
    return FALLBACK;
  }

  const baseUrl = getBaseUrl();

  // Primary endpoint
  const primary = await tryPipelineHealth(baseUrl, token);
  if (primary) return primary;

  console.warn('[mc:health] /api/pipeline/health unavailable, trying /api/tasks/summary');

  // Fallback endpoint
  const secondary = await tryTasksSummary(baseUrl, token);
  if (secondary) return secondary;

  console.warn('[mc:health] Both endpoints unreachable — returning fallback');
  return FALLBACK;
}
