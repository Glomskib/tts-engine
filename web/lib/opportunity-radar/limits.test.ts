import { describe, it, expect } from 'vitest';
import { getRadarLimits, canAddCreator, getScanIntervalHours, getRadarLimitDisplay, RADAR_LIMITS } from './limits';

describe('opportunity-radar limits', () => {
  // ── getRadarLimits ───────────────────────────────────────

  describe('getRadarLimits', () => {
    it('returns free limits for null plan', () => {
      const limits = getRadarLimits(null);
      expect(limits.maxWatchedCreators).toBe(5);
      expect(limits.scansPerDay).toBe(1);
    });

    it('returns correct limits for each plan', () => {
      expect(getRadarLimits('free').maxWatchedCreators).toBe(5);
      expect(getRadarLimits('creator_lite').maxWatchedCreators).toBe(15);
      expect(getRadarLimits('creator_pro').maxWatchedCreators).toBe(50);
      // 'business' migrates to 'brand' via migrateOldPlanId
      expect(getRadarLimits('business').maxWatchedCreators).toBe(200);
      expect(getRadarLimits('brand').maxWatchedCreators).toBe(200);
      expect(getRadarLimits('agency').maxWatchedCreators).toBe(500);
    });

    it('handles old plan IDs via migration', () => {
      // 'starter' maps to 'creator_lite'
      const limits = getRadarLimits('starter');
      expect(limits.maxWatchedCreators).toBe(15);
    });

    it('falls back to free for unknown plan', () => {
      const limits = getRadarLimits('nonexistent_plan');
      expect(limits.maxWatchedCreators).toBe(5);
    });
  });

  // ── canAddCreator ────────────────────────────────────────

  describe('canAddCreator', () => {
    it('allows when under limit', () => {
      const result = canAddCreator('free', 3);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(5);
    });

    it('blocks when at limit', () => {
      const result = canAddCreator('free', 5);
      expect(result.allowed).toBe(false);
      expect(result.message).toContain('5');
      expect(result.message).toContain('Free');
    });

    it('blocks when over limit', () => {
      const result = canAddCreator('free', 10);
      expect(result.allowed).toBe(false);
    });

    it('allows pro user with 49 creators', () => {
      const result = canAddCreator('creator_pro', 49);
      expect(result.allowed).toBe(true);
    });

    it('blocks pro user at 50 creators', () => {
      const result = canAddCreator('creator_pro', 50);
      expect(result.allowed).toBe(false);
    });
  });

  // ── getScanIntervalHours ─────────────────────────────────

  describe('getScanIntervalHours', () => {
    it('returns 24h for free (1 scan/day)', () => {
      expect(getScanIntervalHours('free')).toBe(24);
    });

    it('returns 12h for lite (2 scans/day)', () => {
      expect(getScanIntervalHours('creator_lite')).toBe(12);
    });

    it('returns 6h for pro (4 scans/day)', () => {
      expect(getScanIntervalHours('creator_pro')).toBe(6);
    });

    it('returns 2h for agency (12 scans/day)', () => {
      expect(getScanIntervalHours('agency')).toBe(2);
    });
  });

  // ── getRadarLimitDisplay ─────────────────────────────────

  describe('getRadarLimitDisplay', () => {
    it('returns correct display info', () => {
      const display = getRadarLimitDisplay('creator_pro', 30);
      expect(display.planName).toBe('Pro');
      expect(display.maxCreators).toBe(50);
      expect(display.currentCreators).toBe(30);
      expect(display.scansPerDay).toBe(4);
      expect(display.usagePercent).toBe(60);
      expect(display.atLimit).toBe(false);
      expect(display.upgradeMessage).toBeNull();
    });

    it('shows upgrade message when at limit', () => {
      const display = getRadarLimitDisplay('free', 5);
      expect(display.atLimit).toBe(true);
      expect(display.upgradeMessage).toContain('Upgrade');
      expect(display.upgradeMessage).toContain('15'); // next tier limit
    });

    it('handles agency at limit (no next tier)', () => {
      const display = getRadarLimitDisplay('agency', 500);
      expect(display.atLimit).toBe(true);
      // Agency has no next tier, so upgrade message may be null
    });
  });

  // ── Plan limits are sane ─────────────────────────────────

  describe('plan limit sanity', () => {
    it('each higher tier has more creators than the previous', () => {
      const tiers = ['free', 'creator_lite', 'creator_pro', 'brand', 'agency'];
      for (let i = 1; i < tiers.length; i++) {
        const prev = RADAR_LIMITS[tiers[i - 1]];
        const curr = RADAR_LIMITS[tiers[i]];
        expect(curr.maxWatchedCreators).toBeGreaterThan(prev.maxWatchedCreators);
      }
    });

    it('each higher tier has more scans/day', () => {
      const tiers = ['free', 'creator_lite', 'creator_pro', 'brand', 'agency'];
      for (let i = 1; i < tiers.length; i++) {
        const prev = RADAR_LIMITS[tiers[i - 1]];
        const curr = RADAR_LIMITS[tiers[i]];
        expect(curr.scansPerDay).toBeGreaterThanOrEqual(prev.scansPerDay);
      }
    });
  });
});
