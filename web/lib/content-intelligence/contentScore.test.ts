import { describe, it, expect } from 'vitest';
import { calculateContentScore } from './contentScore';

describe('calculateContentScore', () => {
  it('returns null when views are missing', () => {
    expect(calculateContentScore({ views: null, likes: 10, comments: 5, shares: 2 })).toBeNull();
  });

  it('returns null when views are zero', () => {
    expect(calculateContentScore({ views: 0, likes: 10, comments: 5, shares: 2 })).toBeNull();
  });

  it('grades D for low engagement (< 3%)', () => {
    const result = calculateContentScore({ views: 10000, likes: 100, comments: 10, shares: 5 });
    expect(result).not.toBeNull();
    expect(result!.grade).toBe('D');
    expect(result!.engagement_rate).toBeCloseTo(1.15, 1);
  });

  it('grades C for 3-5% engagement', () => {
    const result = calculateContentScore({ views: 1000, likes: 30, comments: 5, shares: 5 });
    expect(result!.grade).toBe('C');
  });

  it('grades B for 5-8% engagement', () => {
    const result = calculateContentScore({ views: 1000, likes: 50, comments: 10, shares: 5 });
    expect(result!.grade).toBe('B');
  });

  it('grades A for 8-12% engagement', () => {
    const result = calculateContentScore({ views: 1000, likes: 80, comments: 10, shares: 10 });
    expect(result!.grade).toBe('A');
  });

  it('grades A+ for > 12% engagement', () => {
    const result = calculateContentScore({ views: 1000, likes: 100, comments: 20, shares: 15 });
    expect(result!.grade).toBe('A+');
  });

  it('bumps grade by one with hook_strength >= 8', () => {
    // Would be C without hook boost
    const result = calculateContentScore(
      { views: 1000, likes: 30, comments: 5, shares: 5 },
      8,
    );
    expect(result!.grade).toBe('B');
    expect(result!.hook_boosted).toBe(true);
  });

  it('does not bump grade with hook_strength < 8', () => {
    const result = calculateContentScore(
      { views: 1000, likes: 30, comments: 5, shares: 5 },
      7,
    );
    expect(result!.grade).toBe('C');
    expect(result!.hook_boosted).toBe(false);
  });

  it('does not bump A+ higher', () => {
    const result = calculateContentScore(
      { views: 1000, likes: 100, comments: 20, shares: 15 },
      9,
    );
    expect(result!.grade).toBe('A+');
    expect(result!.hook_boosted).toBe(true);
  });

  it('treats null likes/comments/shares as zero', () => {
    const result = calculateContentScore({ views: 1000, likes: null, comments: null, shares: null });
    expect(result!.grade).toBe('D');
    expect(result!.engagement_rate).toBe(0);
  });
});
