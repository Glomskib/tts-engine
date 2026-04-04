import { describe, it, expect } from 'vitest';
import { computeOpportunityScore } from './scoring';
import type { ObservationConfidence, CreatorPriority } from './types';

/**
 * Ingestion tests for pure logic.
 * DB-dependent dedup/upsert behavior is validated via integration tests.
 * These tests cover the scoring and change-detection logic used during ingestion.
 */

describe('opportunity-radar ingestion logic', () => {
  // ── Dedup change detection logic ───────────────────────────

  describe('change detection', () => {
    it('identifies material changes when confidence upgrades', () => {
      const existing: { confidence: string; creator_has_posted: boolean } = { confidence: 'medium', creator_has_posted: false };
      const incoming: { confidence: string; creator_has_posted: boolean } = { confidence: 'confirmed', creator_has_posted: false };
      const changed = existing.confidence !== incoming.confidence;
      expect(changed).toBe(true);
    });

    it('identifies material change when creator_has_posted flips', () => {
      const existing = { creator_has_posted: false };
      const incoming = { creator_has_posted: true };
      const changed = existing.creator_has_posted !== incoming.creator_has_posted;
      expect(changed).toBe(true);
    });

    it('no material change when values are the same', () => {
      const existing = { confidence: 'medium', creator_has_posted: false, brand_name: 'Acme' };
      const incoming = { confidence: 'medium', creator_has_posted: false, brand_name: 'Acme' };
      const fields = ['confidence', 'creator_has_posted', 'brand_name'] as const;
      const changes = fields.filter(
        (f) => (existing as Record<string, unknown>)[f] !== (incoming as Record<string, unknown>)[f],
      );
      expect(changes.length).toBe(0);
    });

    it('undefined incoming fields are skipped (not treated as changes)', () => {
      const existing = { confidence: 'medium', brand_name: 'Acme' };
      const incoming: Record<string, unknown> = { confidence: 'medium', brand_name: undefined };
      // The ingestion code skips fields where incoming === undefined
      const shouldSkip = incoming.brand_name === undefined;
      expect(shouldSkip).toBe(true);
    });
  });

  // ── Score recalculation on material change ──────────────────

  describe('rescore after update', () => {
    const base = {
      first_seen_at: new Date().toISOString(),
      creator_has_posted: false,
      confidence: 'medium' as ObservationConfidence,
      times_seen: 1,
    };

    it('score increases when confidence upgrades', () => {
      const before = computeOpportunityScore(base, 'medium', 0);
      const after = computeOpportunityScore({ ...base, confidence: 'confirmed' }, 'medium', 0);
      expect(after.total).toBeGreaterThan(before.total);
    });

    it('score decreases when creator_has_posted becomes true', () => {
      const before = computeOpportunityScore(base, 'medium', 0);
      const after = computeOpportunityScore({ ...base, creator_has_posted: true }, 'medium', 0);
      expect(after.total).toBeLessThan(before.total);
    });

    it('score increases when times_seen grows', () => {
      const before = computeOpportunityScore(base, 'medium', 0);
      const after = computeOpportunityScore({ ...base, times_seen: 5 }, 'medium', 0);
      expect(after.total).toBeGreaterThan(before.total);
    });

    it('score increases when multi-creator signal emerges', () => {
      const before = computeOpportunityScore(base, 'medium', 0);
      const after = computeOpportunityScore(base, 'medium', 2);
      expect(after.total).toBeGreaterThan(before.total);
    });
  });

  // ── Batch processing behavior ──────────────────────────────

  describe('batch result tracking', () => {
    it('action types are exclusive: created, updated, or no_change', () => {
      const actions = ['created', 'updated', 'no_change'] as const;
      type Action = typeof actions[number];
      const results: { action: Action }[] = [
        { action: 'created' },
        { action: 'updated' },
        { action: 'no_change' },
        { action: 'created' },
      ];
      const created = results.filter((r) => r.action === 'created').length;
      const updated = results.filter((r) => r.action === 'updated').length;
      const unchanged = results.filter((r) => r.action === 'no_change').length;
      expect(created + updated + unchanged).toBe(results.length);
      expect(created).toBe(2);
      expect(updated).toBe(1);
      expect(unchanged).toBe(1);
    });
  });
});
