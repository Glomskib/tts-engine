/**
 * OpenClaw Integration Client
 *
 * Sends creator scan requests to the OpenClaw agent and handles
 * retries, timeouts, rate limiting, and logging.
 *
 * Env:
 *   OPENCLAW_API_URL  — Base URL for the OpenClaw agent (required for scans)
 *   OPENCLAW_API_KEY  — Bearer token for authentication
 */

import { isOpenClawEnabled, openclawSkipLog } from '../openclaw-gate';

const LOG = '[openclaw/client]';

// ── Config ──────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return process.env.OPENCLAW_API_URL?.replace(/\/$/, '') || '';
}

function getApiKey(): string {
  return process.env.OPENCLAW_API_KEY || '';
}

// ── Types ───────────────────────────────────────────────────────────────

export interface CreatorScanRequest {
  creator_handle: string;
  platform: string;
  creator_source_id: string;
  /** Workspace IDs watching this creator (for callback context) */
  workspace_ids: string[];
  scan_reason: 'scheduled' | 'manual' | 'priority_change';
  /** Callback URL for OpenClaw to POST results back */
  callback_url?: string;
}

export interface CreatorScanProduct {
  product_name: string;
  brand_name?: string | null;
  product_url?: string | null;
  product_image_url?: string | null;
  confidence: 'high' | 'medium' | 'low';
  creator_has_posted: boolean;
}

export interface CreatorScanResponse {
  ok: boolean;
  scan_id?: string;
  /** 'accepted' = async (will callback), 'completed' = sync (products inline) */
  mode: 'accepted' | 'completed';
  products?: CreatorScanProduct[];
  error?: string;
}

// ── Probe types ──────────────────────────────────────────────────────

export interface CreatorProbeRequest {
  creator_handle: string;
  platform: string;
  creator_source_id: string;
  mode: 'probe';
  /** Previous fingerprint for server-side comparison (optional) */
  last_fingerprint?: string | null;
}

export interface CreatorProbeResponse {
  ok: boolean;
  changed: boolean;
  fingerprint: string | null;
  product_count: number;
  /** If changed=true and products available inline, include them */
  products?: CreatorScanProduct[];
  error?: string;
}

// ── Rate limiting ───────────────────────────────────────────────────────

const RATE_LIMIT = {
  maxPerMinute: 10,
  maxConcurrent: 3,
};

let _recentRequests: number[] = [];
let _concurrent = 0;

function canSend(): { allowed: boolean; reason?: string } {
  const now = Date.now();
  // Prune requests older than 60s
  _recentRequests = _recentRequests.filter((t) => now - t < 60_000);

  if (_recentRequests.length >= RATE_LIMIT.maxPerMinute) {
    return { allowed: false, reason: `Rate limit: ${RATE_LIMIT.maxPerMinute} requests/min exceeded` };
  }
  if (_concurrent >= RATE_LIMIT.maxConcurrent) {
    return { allowed: false, reason: `Concurrent limit: ${RATE_LIMIT.maxConcurrent} in-flight scans` };
  }
  return { allowed: true };
}

// ── Core ────────────────────────────────────────────────────────────────

/**
 * Request a creator scan from the OpenClaw agent.
 *
 * OpenClaw may respond synchronously (with products inline) or
 * asynchronously (accepted + callback). The handler supports both modes.
 */
export async function requestCreatorScan(
  request: CreatorScanRequest,
): Promise<CreatorScanResponse> {
  // Gate check
  if (!isOpenClawEnabled()) {
    openclawSkipLog('requestCreatorScan');
    return { ok: false, mode: 'completed', error: 'OpenClaw is disabled' };
  }

  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();

  if (!baseUrl) {
    return { ok: false, mode: 'completed', error: 'OPENCLAW_API_URL not configured' };
  }

  // Rate limit check
  const rateCheck = canSend();
  if (!rateCheck.allowed) {
    console.warn(`${LOG} ${rateCheck.reason} — skipping scan for @${request.creator_handle}`);
    return { ok: false, mode: 'completed', error: rateCheck.reason };
  }

  const url = `${baseUrl}/api/scan/creator`;
  const startMs = Date.now();

  _recentRequests.push(startMs);
  _concurrent++;

  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(request),
    });

    const durationMs = Date.now() - startMs;
    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error || `HTTP ${response.status}`;
      console.error(`${LOG} scan failed for @${request.creator_handle}: ${errMsg} (${durationMs}ms)`);
      return { ok: false, mode: 'completed', error: errMsg };
    }

    console.log(
      `${LOG} scan ${data.mode || 'completed'} for @${request.creator_handle}` +
        ` — ${data.products?.length ?? 0} products (${durationMs}ms)`,
    );

    return {
      ok: true,
      scan_id: data.scan_id,
      mode: data.mode || 'completed',
      products: data.products,
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} request failed for @${request.creator_handle}: ${errMsg} (${durationMs}ms)`);
    return { ok: false, mode: 'completed', error: errMsg };
  } finally {
    _concurrent--;
  }
}

// ── Probe ────────────────────────────────────────────────────────────────

/**
 * Cheap probe: ask OpenClaw whether a creator's product state has changed
 * since the last fingerprint. Much cheaper than a full scan.
 *
 * If OpenClaw doesn't support probes yet, returns { ok: false, error: 'unsupported' }
 * and the caller should fall back to a full scan.
 */
export async function probeCreator(
  request: CreatorProbeRequest,
): Promise<CreatorProbeResponse> {
  if (!isOpenClawEnabled()) {
    openclawSkipLog('probeCreator');
    return { ok: false, changed: true, fingerprint: null, product_count: 0, error: 'OpenClaw is disabled' };
  }

  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();

  if (!baseUrl) {
    return { ok: false, changed: true, fingerprint: null, product_count: 0, error: 'OPENCLAW_API_URL not configured' };
  }

  const rateCheck = canSend();
  if (!rateCheck.allowed) {
    return { ok: false, changed: true, fingerprint: null, product_count: 0, error: rateCheck.reason };
  }

  const url = `${baseUrl}/api/scan/probe`;
  const startMs = Date.now();

  _recentRequests.push(startMs);
  _concurrent++;

  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(request),
    });

    const durationMs = Date.now() - startMs;

    // If probe endpoint doesn't exist (404), fall back gracefully
    if (response.status === 404) {
      console.log(`${LOG} probe not supported for @${request.creator_handle} (${durationMs}ms) — will use full scan`);
      return { ok: false, changed: true, fingerprint: null, product_count: 0, error: 'unsupported' };
    }

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error || `HTTP ${response.status}`;
      console.error(`${LOG} probe failed for @${request.creator_handle}: ${errMsg} (${durationMs}ms)`);
      return { ok: false, changed: true, fingerprint: null, product_count: 0, error: errMsg };
    }

    console.log(
      `${LOG} probe @${request.creator_handle}: changed=${data.changed}, products=${data.product_count} (${durationMs}ms)`,
    );

    return {
      ok: true,
      changed: data.changed ?? true,
      fingerprint: data.fingerprint ?? null,
      product_count: data.product_count ?? 0,
      products: data.products,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} probe request failed for @${request.creator_handle}: ${errMsg}`);
    return { ok: false, changed: true, fingerprint: null, product_count: 0, error: errMsg };
  } finally {
    _concurrent--;
  }
}

// ── Retry logic ─────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000]; // ms
const TIMEOUT_MS = 30_000;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempt = 0,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });

    // Retry on 5xx or 429 (rate limited by OpenClaw)
    if (attempt < MAX_RETRIES && (response.status >= 500 || response.status === 429)) {
      const delay = RETRY_DELAYS[attempt] ?? 3000;
      console.warn(`${LOG} HTTP ${response.status} — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      return fetchWithRetry(url, init, attempt + 1);
    }

    return response;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS[attempt] ?? 3000;
      const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network error';
      console.warn(`${LOG} ${reason} — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      return fetchWithRetry(url, init, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Test helpers (exported for testing) ─────────────────────────────────

export function _resetRateLimits(): void {
  _recentRequests = [];
  _concurrent = 0;
}
