/**
 * Tests for scan fingerprinting and change detection
 */

import { describe, it, expect } from 'vitest';
import { computeProductFingerprint, hasFingerPrintChanged, computeProbeFingerprint } from './fingerprint';
import type { CreatorScanProduct } from '@/lib/openclaw/client';

describe('computeProductFingerprint', () => {
  const products: CreatorScanProduct[] = [
    { product_name: 'Electrolyte Chews', product_url: 'https://shop.example.com/chews', confidence: 'high', creator_has_posted: false },
    { product_name: 'Protein Bar', product_url: 'https://shop.example.com/bar', confidence: 'medium', creator_has_posted: true },
  ];

  it('returns null for empty or undefined products', () => {
    expect(computeProductFingerprint(null)).toBeNull();
    expect(computeProductFingerprint(undefined)).toBeNull();
    expect(computeProductFingerprint([])).toBeNull();
  });

  it('returns a stable hash for the same products', () => {
    const hash1 = computeProductFingerprint(products);
    const hash2 = computeProductFingerprint(products);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(32);
  });

  it('is order-independent', () => {
    const reversed = [...products].reverse();
    expect(computeProductFingerprint(products)).toBe(computeProductFingerprint(reversed));
  });

  it('is case-insensitive', () => {
    const upper = products.map(p => ({ ...p, product_name: p.product_name.toUpperCase() }));
    expect(computeProductFingerprint(products)).toBe(computeProductFingerprint(upper));
  });

  it('changes when a product is added', () => {
    const extra = [...products, { product_name: 'New Product', confidence: 'low' as const, creator_has_posted: false }];
    expect(computeProductFingerprint(products)).not.toBe(computeProductFingerprint(extra));
  });

  it('changes when a product is removed', () => {
    const fewer = [products[0]];
    expect(computeProductFingerprint(products)).not.toBe(computeProductFingerprint(fewer));
  });

  it('changes when confidence changes', () => {
    const modified = products.map((p, i) => i === 0 ? { ...p, confidence: 'low' as const } : p);
    expect(computeProductFingerprint(products)).not.toBe(computeProductFingerprint(modified));
  });

  it('changes when creator_has_posted changes', () => {
    const modified = products.map((p, i) => i === 0 ? { ...p, creator_has_posted: true } : p);
    expect(computeProductFingerprint(products)).not.toBe(computeProductFingerprint(modified));
  });
});

describe('hasFingerPrintChanged', () => {
  it('returns true when stored is null', () => {
    expect(hasFingerPrintChanged(null, 'abc')).toBe(true);
  });

  it('returns true when incoming is null', () => {
    expect(hasFingerPrintChanged('abc', null)).toBe(true);
  });

  it('returns true when both are null', () => {
    expect(hasFingerPrintChanged(null, null)).toBe(true);
  });

  it('returns false when fingerprints match', () => {
    expect(hasFingerPrintChanged('abc123', 'abc123')).toBe(false);
  });

  it('returns true when fingerprints differ', () => {
    expect(hasFingerPrintChanged('abc123', 'def456')).toBe(true);
  });
});

describe('computeProbeFingerprint', () => {
  it('produces a stable hash', () => {
    const hash1 = computeProbeFingerprint({ product_count: 3 });
    const hash2 = computeProbeFingerprint({ product_count: 3 });
    expect(hash1).toBe(hash2);
  });

  it('changes with different product count', () => {
    const hash1 = computeProbeFingerprint({ product_count: 3 });
    const hash2 = computeProbeFingerprint({ product_count: 4 });
    expect(hash1).not.toBe(hash2);
  });

  it('includes product IDs when provided', () => {
    const withIds = computeProbeFingerprint({ product_count: 2, product_ids: ['a', 'b'] });
    const withoutIds = computeProbeFingerprint({ product_count: 2 });
    expect(withIds).not.toBe(withoutIds);
  });

  it('is order-independent for product IDs', () => {
    const hash1 = computeProbeFingerprint({ product_count: 2, product_ids: ['a', 'b'] });
    const hash2 = computeProbeFingerprint({ product_count: 2, product_ids: ['b', 'a'] });
    expect(hash1).toBe(hash2);
  });
});
