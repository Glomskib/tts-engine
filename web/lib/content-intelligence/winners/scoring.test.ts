/**
 * Tests for Winners Engine scoring + pattern key functions.
 *
 * Run: npx tsx lib/content-intelligence/winners/scoring.test.ts
 */

import assert from 'node:assert';
import {
  computePerformanceScore,
  getLengthBucket,
  extractHookFromCaption,
  buildPatternKey,
  patternKeyString,
  isBreakoutWinner,
} from './scoring';
import type { PostWithMetrics } from './types';

// ── computePerformanceScore ──

// Zero views → 0
assert.strictEqual(
  computePerformanceScore(
    { views: 0, likes: 10, comments: 5, shares: 2, saves: 1, completion_rate: null },
    100,
  ),
  0,
  'zero views should return 0',
);

// High engagement, high views → high score
const highScore = computePerformanceScore(
  { views: 10000, likes: 800, comments: 200, shares: 500, saves: 100, completion_rate: 0.8 },
  2000,
);
assert.ok(highScore >= 60, `high engagement should score >= 60, got ${highScore}`);

// Low engagement, low views → low score
const lowScore = computePerformanceScore(
  { views: 100, likes: 1, comments: 0, shares: 0, saves: 0, completion_rate: 0.1 },
  1000,
);
assert.ok(lowScore < 30, `low engagement should score < 30, got ${lowScore}`);

// Score is between 0 and 100
const midScore = computePerformanceScore(
  { views: 5000, likes: 200, comments: 50, shares: 20, saves: 10, completion_rate: 0.5 },
  5000,
);
assert.ok(midScore >= 0 && midScore <= 100, `score should be 0-100, got ${midScore}`);

// ── getLengthBucket ──

assert.strictEqual(getLengthBucket(null), 'short', 'null → short');
assert.strictEqual(getLengthBucket(5), 'micro', '5s → micro');
assert.strictEqual(getLengthBucket(14), 'micro', '14s → micro');
assert.strictEqual(getLengthBucket(15), 'short', '15s → short');
assert.strictEqual(getLengthBucket(29), 'short', '29s → short');
assert.strictEqual(getLengthBucket(30), 'medium', '30s → medium');
assert.strictEqual(getLengthBucket(59), 'medium', '59s → medium');
assert.strictEqual(getLengthBucket(60), 'long', '60s → long');
assert.strictEqual(getLengthBucket(120), 'long', '120s → long');

// ── extractHookFromCaption ──

assert.strictEqual(extractHookFromCaption(null), null, 'null caption → null');
assert.strictEqual(extractHookFromCaption(''), null, 'empty caption → null');
assert.strictEqual(
  extractHookFromCaption('This changed everything! More details below.'),
  'This changed everything!',
  'should extract first sentence',
);
assert.strictEqual(
  extractHookFromCaption('one two three four five six seven eight nine ten eleven twelve thirteen'),
  'one two three four five six seven eight nine ten eleven twelve',
  'should take first 12 words as fallback',
);

// ── buildPatternKey ──

const mockPost: PostWithMetrics = {
  post_id: 'p1',
  content_item_id: 'ci1',
  platform: 'tiktok',
  product_id: 'prod1',
  caption_used: 'POV: you discovered this product!',
  posted_at: '2026-03-01',
  performance_score: null,
  views: 5000,
  likes: 200,
  comments: 50,
  shares: 20,
  saves: 10,
  avg_watch_time_seconds: 25,
  completion_rate: 0.6,
  metric_snapshot_id: 'ms1',
  title: 'Test Video',
  hook_strength: 8,
  hook_pattern: 'POV discovery hook',
  format_tag: 'ugc',
};

const key = buildPatternKey(mockPost);
assert.strictEqual(key.platform, 'tiktok');
assert.strictEqual(key.product_id, 'prod1');
assert.strictEqual(key.hook_text, 'POV discovery hook', 'should use hook_pattern from postmortem');
assert.strictEqual(key.format_tag, 'ugc');
assert.strictEqual(key.length_bucket, 'short', '25s → short');

// Without hook_pattern, should extract from caption
const noHookPost: PostWithMetrics = { ...mockPost, hook_pattern: null };
const key2 = buildPatternKey(noHookPost);
assert.strictEqual(key2.hook_text, 'POV: you discovered this product!', 'should extract from caption');

// ── patternKeyString ──

const keyStr = patternKeyString(key);
assert.ok(keyStr.includes('tiktok'), 'should contain platform');
assert.ok(keyStr.includes('prod1'), 'should contain product_id');
assert.ok(keyStr.includes('ugc'), 'should contain format_tag');

// Null fields should produce '_'
const keyStr2 = patternKeyString({ platform: 'tiktok', product_id: null, hook_text: null, format_tag: null, length_bucket: null });
assert.strictEqual(keyStr2, 'tiktok|_|_|_|_');

// ── isBreakoutWinner ──

assert.strictEqual(isBreakoutWinner(95, 90), true, '95 >= 90 → breakout');
assert.strictEqual(isBreakoutWinner(85, 90), false, '85 < 90 → not breakout');
assert.strictEqual(isBreakoutWinner(90, 90), true, '90 >= 90 → breakout (equal)');

console.log('✅ All winners engine scoring tests passed');
