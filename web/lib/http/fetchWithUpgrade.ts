/**
 * fetchWithUpgrade — drop-in fetch wrapper that intercepts upgrade signals.
 *
 * When any API response contains `{ upgrade: true }`, this calls
 * `onUpgrade` with the response payload so the caller can trigger
 * the upgrade modal. The raw response is still returned normally.
 *
 * Usage (in a component):
 *   const { showUpgrade } = useUpgradeModal();
 *   const apiFetch = makeFetchWithUpgrade(showUpgrade);
 *   const data = await apiFetch('/api/scripts/generate', { method: 'POST', body: ... });
 *
 * Usage (global hook):
 *   const apiFetch = useApiFetch();   // auto-wired to modal
 */

import { upgradePayloadToOpts } from '@/contexts/UpgradeModalContext';

type ShowUpgrade = (opts?: { headline?: string; subtext?: string; feature?: string }) => void;

/**
 * Create a fetch function that automatically shows the upgrade modal
 * when the backend responds with { upgrade: true }.
 */
export function makeFetchWithUpgrade(showUpgrade: ShowUpgrade) {
  return async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);

    // Clone so we can read the body AND return the original
    if (!response.ok || response.status === 402 || response.status === 429) {
      try {
        const clone = response.clone();
        const json = await clone.json() as Record<string, unknown>;
        if (json.upgrade === true) {
          showUpgrade(upgradePayloadToOpts(json));
        }
      } catch {
        // JSON parse failed — not an upgrade response, ignore
      }
    }

    return response;
  };
}

/**
 * Parse a response and check if it is an upgrade response.
 * Returns the parsed json so callers don't re-parse.
 */
export async function parseUpgradeResponse(
  response: Response,
  showUpgrade: ShowUpgrade,
): Promise<{ json: Record<string, unknown>; wasUpgrade: boolean }> {
  const json = await response.json() as Record<string, unknown>;
  if (json.upgrade === true) {
    showUpgrade(upgradePayloadToOpts(json));
    return { json, wasUpgrade: true };
  }
  return { json, wasUpgrade: false };
}
