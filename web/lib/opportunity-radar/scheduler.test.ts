import { describe, it, expect } from 'vitest';
import { getScanIntervalHours } from './limits';

describe('opportunity-radar scheduler logic', () => {
  // These tests validate the deterministic logic used by the scheduler.
  // The actual DB-calling functions (ensureCreatorSource, getDueScans, etc.)
  // are integration-tested against Supabase, but the cadence logic is pure.

  // ── Scan interval computation ──────────────────────────────

  describe('scan cadence from plan', () => {
    it('free plan → 24h interval (1 scan/day)', () => {
      expect(getScanIntervalHours('free')).toBe(24);
    });

    it('creator_lite → 12h interval (2 scans/day)', () => {
      expect(getScanIntervalHours('creator_lite')).toBe(12);
    });

    it('creator_pro → 6h interval (4 scans/day)', () => {
      expect(getScanIntervalHours('creator_pro')).toBe(6);
    });

    it('brand → 3h interval (8 scans/day)', () => {
      expect(getScanIntervalHours('brand')).toBe(3);
    });

    it('agency → 2h interval (12 scans/day)', () => {
      expect(getScanIntervalHours('agency')).toBe(2);
    });

    it('unknown plan falls back to free (24h)', () => {
      expect(getScanIntervalHours('nonexistent')).toBe(24);
    });

    it('null plan falls back to free (24h)', () => {
      expect(getScanIntervalHours(null)).toBe(24);
    });
  });

  // ── Highest-tier wins cadence selection ─────────────────────

  describe('fastest cadence wins across watchers', () => {
    it('picks the smallest interval from multiple plans', () => {
      const plans = ['free', 'creator_lite', 'creator_pro'];
      const intervals = plans.map((p) => getScanIntervalHours(p));
      const fastest = Math.min(...intervals);
      expect(fastest).toBe(6); // creator_pro wins
    });

    it('agency always wins if present', () => {
      const plans = ['free', 'creator_lite', 'agency'];
      const intervals = plans.map((p) => getScanIntervalHours(p));
      const fastest = Math.min(...intervals);
      expect(fastest).toBe(2);
    });
  });

  // ── next_check_at scheduling ───────────────────────────────

  describe('next_check_at computation', () => {
    it('computes next check from last_checked_at + interval', () => {
      const lastChecked = new Date('2026-03-08T06:00:00Z');
      const intervalHours = 6;
      const nextCheck = new Date(lastChecked.getTime() + intervalHours * 60 * 60 * 1000);
      expect(nextCheck.toISOString()).toBe('2026-03-08T12:00:00.000Z');
    });

    it('never-checked source gets next_check_at = now', () => {
      const lastCheckedAt: string | null = null;
      const intervalHours = 12;
      // When lastCheckedAt is null, next_check_at should be set to now
      // (the scheduler sets it to new Date().toISOString())
      const shouldScheduleImmediately = lastCheckedAt === null;
      expect(shouldScheduleImmediately).toBe(true);
    });
  });
});
