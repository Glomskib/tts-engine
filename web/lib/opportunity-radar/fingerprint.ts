/**
 * Scan Fingerprinting — Deterministic hash for change detection
 *
 * Computes a stable fingerprint from a set of scan products.
 * Used to short-circuit full ingestion when nothing changed.
 *
 * Fingerprint is a SHA-256 hash of:
 *   sorted([product_name|product_url|confidence|creator_has_posted])
 *
 * This is:
 * - deterministic: same products → same hash
 * - stable: order-independent (sorted)
 * - cheap: simple string hash
 * - reliable: based on fields OpenClaw actually returns
 */

import crypto from 'crypto';
import type { CreatorScanProduct } from '@/lib/openclaw/client';

/**
 * Compute a deterministic fingerprint from a list of scan products.
 * Returns null if products array is empty or undefined.
 */
export function computeProductFingerprint(
  products: CreatorScanProduct[] | undefined | null,
): string | null {
  if (!products || products.length === 0) return null;

  const normalized = products
    .map((p) => {
      const name = (p.product_name || '').trim().toLowerCase();
      const url = (p.product_url || '').trim().toLowerCase();
      const confidence = p.confidence || 'medium';
      const posted = p.creator_has_posted ? '1' : '0';
      return `${name}|${url}|${confidence}|${posted}`;
    })
    .sort()
    .join('::');

  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

/**
 * Check if a new fingerprint differs from the stored one.
 * Returns true if changed, false if unchanged.
 * Returns true (assume changed) if either fingerprint is null.
 */
export function hasFingerPrintChanged(
  stored: string | null | undefined,
  incoming: string | null,
): boolean {
  if (!stored || !incoming) return true;
  return stored !== incoming;
}

/**
 * Compute a lightweight product count fingerprint for probe mode.
 * Used when OpenClaw returns a probe response (count + basic metadata).
 */
export function computeProbeFingerprint(
  probe: { product_count: number; product_ids?: string[]; timestamp?: string },
): string {
  const parts = [
    `count:${probe.product_count}`,
    ...(probe.product_ids ? [`ids:${probe.product_ids.sort().join(',')}`] : []),
  ].join('|');

  return crypto.createHash('sha256').update(parts).digest('hex').slice(0, 32);
}
