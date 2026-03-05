import { describe, it, expect } from 'vitest';
import {
  computePerformanceScore,
  getLengthBucket,
  extractHookFromCaption,
  buildPatternKey,
  patternKeyString,
  isBreakoutWinner,
} from './scoring';
import type { PostWithMetrics } from './types';

describe('computePerformanceScore', () => {
  it('returns 0 for zero views', () => {
    expect(computePerformanceScore(
      { views: 0, likes: 10, comments: 5, shares: 2, saves: 1, completion_rate: null },
      100,
    )).toBe(0);
  });

  it('scores high for high engagement + views', () => {
    const score = computePerformanceScore(
      { views: 10000, likes: 800, comments: 200, shares: 500, saves: 100, completion_rate: 0.8 },
      2000,
    );
    expect(score).toBeGreaterThanOrEqual(60);
  });

  it('scores low for low engagement + views', () => {
    const score = computePerformanceScore(
      { views: 100, likes: 1, comments: 0, shares: 0, saves: 0, completion_rate: 0.1 },
      1000,
    );
    expect(score).toBeLessThan(30);
  });

  it('returns score between 0 and 100', () => {
    const score = computePerformanceScore(
      { views: 5000, likes: 200, comments: 50, shares: 20, saves: 10, completion_rate: 0.5 },
      5000,
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('getLengthBucket', () => {
  it('returns short for null', () => expect(getLengthBucket(null)).toBe('short'));
  it('returns micro for < 15s', () => {
    expect(getLengthBucket(5)).toBe('micro');
    expect(getLengthBucket(14)).toBe('micro');
  });
  it('returns short for 15-29s', () => {
    expect(getLengthBucket(15)).toBe('short');
    expect(getLengthBucket(29)).toBe('short');
  });
  it('returns medium for 30-59s', () => {
    expect(getLengthBucket(30)).toBe('medium');
    expect(getLengthBucket(59)).toBe('medium');
  });
  it('returns long for 60s+', () => {
    expect(getLengthBucket(60)).toBe('long');
    expect(getLengthBucket(120)).toBe('long');
  });
});

describe('extractHookFromCaption', () => {
  it('returns null for null/empty', () => {
    expect(extractHookFromCaption(null)).toBeNull();
    expect(extractHookFromCaption('')).toBeNull();
  });
  it('extracts first sentence', () => {
    expect(extractHookFromCaption('This changed everything! More details below.'))
      .toBe('This changed everything!');
  });
  it('falls back to first 12 words', () => {
    expect(extractHookFromCaption('one two three four five six seven eight nine ten eleven twelve thirteen'))
      .toBe('one two three four five six seven eight nine ten eleven twelve');
  });
});

describe('buildPatternKey', () => {
  const mockPost: PostWithMetrics = {
    post_id: 'p1',
    content_item_id: 'ci1',
    platform: 'tiktok',
    product_id: 'prod1',
    caption_used: 'POV: you discovered this product!',
    posted_at: '2026-03-01',
    performance_score: null,
    views: 5000, likes: 200, comments: 50, shares: 20, saves: 10,
    avg_watch_time_seconds: 25,
    completion_rate: 0.6,
    metric_snapshot_id: 'ms1',
    title: 'Test Video',
    hook_strength: 8,
    hook_pattern: 'POV discovery hook',
    format_tag: 'ugc',
  };

  it('uses hook_pattern from postmortem when available', () => {
    const key = buildPatternKey(mockPost);
    expect(key.hook_text).toBe('POV discovery hook');
    expect(key.platform).toBe('tiktok');
    expect(key.product_id).toBe('prod1');
    expect(key.format_tag).toBe('ugc');
    expect(key.length_bucket).toBe('short');
  });

  it('extracts from caption when hook_pattern is null', () => {
    const key = buildPatternKey({ ...mockPost, hook_pattern: null });
    expect(key.hook_text).toBe('POV: you discovered this product!');
  });
});

describe('patternKeyString', () => {
  it('joins fields with pipe separator', () => {
    const str = patternKeyString({
      platform: 'tiktok', product_id: 'prod1', hook_text: 'test', format_tag: 'ugc', length_bucket: 'short',
    });
    expect(str).toContain('tiktok');
    expect(str).toContain('prod1');
    expect(str).toContain('ugc');
  });

  it('uses _ for null fields', () => {
    expect(patternKeyString({
      platform: 'tiktok', product_id: null, hook_text: null, format_tag: null, length_bucket: null,
    })).toBe('tiktok|_|_|_|_');
  });
});

describe('isBreakoutWinner', () => {
  it('returns true when score >= threshold', () => {
    expect(isBreakoutWinner(95, 90)).toBe(true);
    expect(isBreakoutWinner(90, 90)).toBe(true);
  });
  it('returns false when score < threshold', () => {
    expect(isBreakoutWinner(85, 90)).toBe(false);
  });
});
