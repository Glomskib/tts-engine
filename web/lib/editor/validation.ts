/**
 * Shared editor asset validation — server + client.
 * Single source of truth for per-kind size and mime limits.
 * Imported by:
 *   - app/api/editor/jobs/[id]/upload/route.ts
 *   - app/api/editor/jobs/from-pipeline/route.ts
 *   - components/SendToEditorModal.tsx (via the exported constants)
 */
import type { AssetKind } from './pipeline';

export interface AssetRule {
  maxBytes: number;
  mimes: string[];
  label: string;
}

export const VALID_KINDS = new Set<AssetKind>(['raw', 'broll', 'product', 'music']);

export const EDITOR_ASSET_LIMITS: Record<AssetKind, AssetRule> = {
  raw: {
    maxBytes: 500 * 1024 * 1024,
    mimes: ['video/mp4', 'video/quicktime', 'video/webm'],
    label: 'Raw footage',
  },
  broll: {
    maxBytes: 500 * 1024 * 1024,
    mimes: [
      'video/mp4', 'video/quicktime', 'video/webm',
      'image/jpeg', 'image/png', 'image/webp',
    ],
    label: 'B-roll',
  },
  product: {
    maxBytes: 10 * 1024 * 1024,
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
    label: 'Product image',
  },
  music: {
    maxBytes: 20 * 1024 * 1024,
    mimes: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/mp3'],
    label: 'Music bed',
  },
};

export function formatMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function sanitizeAssetName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/**
 * Validate a blob/file against the rule for its kind.
 * Returns null on success, or a human-readable error string.
 */
export function validateEditorAsset(
  kind: AssetKind,
  blob: { size: number; type?: string; name?: string },
): string | null {
  const rule = EDITOR_ASSET_LIMITS[kind];
  if (!rule) return `Invalid asset kind "${kind}".`;
  if (blob.size > rule.maxBytes) {
    return `${rule.label} is ${formatMB(blob.size)} — the limit for this slot is ${formatMB(rule.maxBytes)}. Trim or compress the file and try again.`;
  }
  const mime = (blob.type || '').toLowerCase();
  if (mime && !rule.mimes.includes(mime)) {
    return `${rule.label} must be one of: ${rule.mimes.join(', ')}. Got "${mime}".`;
  }
  return null;
}
