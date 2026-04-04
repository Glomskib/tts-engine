import { describe, it, expect } from 'vitest';
import { computeOpportunityScore, scoreToLabel } from './scoring';

describe('opportunity-radar scoring', () => {
  const baseInput = {
    first_seen_at: new Date().toISOString(), // today = recent
    creator_has_posted: false,
    confidence: 'medium' as const,
    times_seen: 1,
  };

  // ── computeOpportunityScore ──────────────────────────────

  describe('computeOpportunityScore', () => {
    it('returns a ScoreBreakdown with total <= 100', () => {
      const result = computeOpportunityScore(baseInput, 'critical', 5);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.reasons).toBeDefined();
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('scores recency: first_seen today = 25', () => {
      const result = computeOpportunityScore(baseInput, 'medium', 0);
      expect(result.recency).toBe(25);
    });

    it('scores recency: first_seen 10 days ago = 18', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const result = computeOpportunityScore({ ...baseInput, first_seen_at: tenDaysAgo }, 'medium', 0);
      expect(result.recency).toBe(18);
    });

    it('scores recency: first_seen 20 days ago = 10', () => {
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const result = computeOpportunityScore({ ...baseInput, first_seen_at: twentyDaysAgo }, 'medium', 0);
      expect(result.recency).toBe(10);
    });

    it('scores recency: first_seen 60 days ago = 3', () => {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const result = computeOpportunityScore({ ...baseInput, first_seen_at: sixtyDaysAgo }, 'medium', 0);
      expect(result.recency).toBe(3);
    });

    it('scores not_yet_posted: false = 20, true = 0', () => {
      const notPosted = computeOpportunityScore(baseInput, 'medium', 0);
      expect(notPosted.not_yet_posted).toBe(20);

      const posted = computeOpportunityScore({ ...baseInput, creator_has_posted: true }, 'medium', 0);
      expect(posted.not_yet_posted).toBe(0);
    });

    it('scores creator priority correctly', () => {
      expect(computeOpportunityScore(baseInput, 'critical', 0).creator_priority).toBe(20);
      expect(computeOpportunityScore(baseInput, 'high', 0).creator_priority).toBe(15);
      expect(computeOpportunityScore(baseInput, 'medium', 0).creator_priority).toBe(10);
      expect(computeOpportunityScore(baseInput, 'low', 0).creator_priority).toBe(5);
    });

    it('scores confidence correctly', () => {
      expect(computeOpportunityScore({ ...baseInput, confidence: 'confirmed' }, 'medium', 0).confidence).toBe(15);
      expect(computeOpportunityScore({ ...baseInput, confidence: 'high' }, 'medium', 0).confidence).toBe(12);
      expect(computeOpportunityScore({ ...baseInput, confidence: 'medium' }, 'medium', 0).confidence).toBe(8);
      expect(computeOpportunityScore({ ...baseInput, confidence: 'low' }, 'medium', 0).confidence).toBe(3);
    });

    it('scores repeat sightings correctly', () => {
      expect(computeOpportunityScore({ ...baseInput, times_seen: 1 }, 'medium', 0).repeat_sightings).toBe(2);
      expect(computeOpportunityScore({ ...baseInput, times_seen: 2 }, 'medium', 0).repeat_sightings).toBe(5);
      expect(computeOpportunityScore({ ...baseInput, times_seen: 3 }, 'medium', 0).repeat_sightings).toBe(7);
      expect(computeOpportunityScore({ ...baseInput, times_seen: 5 }, 'medium', 0).repeat_sightings).toBe(10);
    });

    it('scores multi-creator signal correctly', () => {
      expect(computeOpportunityScore(baseInput, 'medium', 0).multi_creator).toBe(0);
      expect(computeOpportunityScore(baseInput, 'medium', 1).multi_creator).toBe(3);
      expect(computeOpportunityScore(baseInput, 'medium', 2).multi_creator).toBe(7);
      expect(computeOpportunityScore(baseInput, 'medium', 3).multi_creator).toBe(10);
    });

    it('max score scenario: recent + not posted + critical + confirmed + 5x seen + 3 creators = 100', () => {
      const result = computeOpportunityScore(
        { first_seen_at: new Date().toISOString(), creator_has_posted: false, confidence: 'confirmed', times_seen: 5 },
        'critical',
        3,
      );
      expect(result.total).toBe(100);
    });

    it('total equals sum of components (capped at 100)', () => {
      const result = computeOpportunityScore(baseInput, 'medium', 1);
      const sum = result.recency + result.not_yet_posted + result.creator_priority +
        result.confidence + result.repeat_sightings + result.multi_creator;
      expect(result.total).toBe(Math.min(sum, 100));
    });

    it('populates human-readable reasons for each component', () => {
      const result = computeOpportunityScore(baseInput, 'high', 2);
      // Should have at least 5 reasons (one per scored component)
      expect(result.reasons.length).toBeGreaterThanOrEqual(5);
      // Each reason should include a score value
      for (const reason of result.reasons) {
        expect(reason).toMatch(/\+\d+/);
      }
    });
  });

  // ── scoreToLabel ─────────────────────────────────────────

  describe('scoreToLabel', () => {
    it('returns hot for >= 75', () => {
      expect(scoreToLabel(75)).toBe('hot');
      expect(scoreToLabel(100)).toBe('hot');
    });

    it('returns warm for >= 50', () => {
      expect(scoreToLabel(50)).toBe('warm');
      expect(scoreToLabel(74)).toBe('warm');
    });

    it('returns cool for >= 25', () => {
      expect(scoreToLabel(25)).toBe('cool');
      expect(scoreToLabel(49)).toBe('cool');
    });

    it('returns cold for < 25', () => {
      expect(scoreToLabel(0)).toBe('cold');
      expect(scoreToLabel(24)).toBe('cold');
    });
  });
});
