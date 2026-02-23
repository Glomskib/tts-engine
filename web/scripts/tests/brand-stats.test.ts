#!/usr/bin/env npx tsx
/**
 * Unit tests for computeBrandStats.
 *
 * Run:  npx tsx scripts/tests/brand-stats.test.ts
 *
 * Zero dependencies — uses Node assert.
 */
import { strict as assert } from 'node:assert';
import {
  computeBrandStats,
  BrandForStats,
  BrandVideo,
  BrandProduct,
  BrandWinner,
} from '../../lib/brands/brand-stats';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBrand(overrides: Partial<BrandForStats> = {}): BrandForStats {
  return { name: 'TestBrand', monthly_video_quota: 10, videos_this_month: 0, ...overrides };
}

function makeVideo(overrides: Partial<BrandVideo> = {}): BrandVideo {
  return {
    brand_name: 'TestBrand',
    product_name: 'Product A',
    recording_status: 'POSTED',
    tiktok_views: null,
    tiktok_likes: null,
    ...overrides,
  };
}

function makeProduct(overrides: Partial<BrandProduct> = {}): BrandProduct {
  return { id: '1', name: 'Product A', brand: 'TestBrand', ...overrides };
}

function makeWinner(overrides: Partial<BrandWinner> = {}): BrandWinner {
  return { brand: 'TestBrand', ...overrides };
}

console.log('\n=== Brand Stats Tests ===\n');

// ── Base score ──────────────────────────────────────────────────────────────

test('base: no data with unlimited quota → 55, needs_attention', () => {
  // base 50 + 15 (unlimited) − 10 (0 posted) = 55
  const result = computeBrandStats(makeBrand({ monthly_video_quota: 0 }), [], [], []);
  assert.equal(result.health_score, 55);
  assert.equal(result.health_label, 'needs_attention');
  assert.equal(result.total_videos, 0);
  assert.equal(result.posted_videos, 0);
  assert.equal(result.winner_count, 0);
  assert.equal(result.avg_engagement, 0);
  assert.equal(result.suggested_product, null);
});

// ── Excellent health ────────────────────────────────────────────────────────

test('excellent: high quota, 5+ posted, 3+ winners, 5%+ engagement → 100', () => {
  // base 50 + 30 (70% quota) + 20 (6 posted) + 20 (4 winners) + 10 (6% eng) = 130 → 100
  const brand = makeBrand({ monthly_video_quota: 10, videos_this_month: 7 });
  const videos = Array.from({ length: 6 }, () =>
    makeVideo({ tiktok_views: 1000, tiktok_likes: 60 })
  );
  const winners = Array.from({ length: 4 }, () => makeWinner());
  const result = computeBrandStats(brand, videos, [makeProduct()], winners);
  assert.equal(result.health_score, 100);
  assert.equal(result.health_label, 'excellent');
});

// ── Quota scoring ───────────────────────────────────────────────────────────

test('quota: 0% usage → −10', () => {
  // base 50 − 10 (0% quota) + 20 (5 posted) = 60
  const brand = makeBrand({ monthly_video_quota: 10, videos_this_month: 0 });
  const videos = Array.from({ length: 5 }, () => makeVideo());
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 60);
});

test('quota: 25-49% usage → +15', () => {
  // base 50 + 15 (30% quota) + 20 (5 posted) = 85
  const brand = makeBrand({ monthly_video_quota: 10, videos_this_month: 3 });
  const videos = Array.from({ length: 5 }, () => makeVideo());
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 85);
});

test('quota: 50-100% usage → +30', () => {
  // base 50 + 30 (70% quota) + 20 (5 posted) = 100
  const brand = makeBrand({ monthly_video_quota: 10, videos_this_month: 7 });
  const videos = Array.from({ length: 5 }, () => makeVideo());
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 100);
});

test('quota: unlimited (0) → +15', () => {
  // base 50 + 15 (unlimited) + 20 (5 posted) = 85
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = Array.from({ length: 5 }, () => makeVideo());
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 85);
});

// ── Content production ──────────────────────────────────────────────────────

test('content: 0 posted → −10', () => {
  // base 50 + 15 (unlimited) − 10 (0 posted) = 55
  const brand = makeBrand({ monthly_video_quota: 0 });
  const result = computeBrandStats(brand, [], [], []);
  assert.equal(result.health_score, 55);
});

test('content: 1 posted → −10', () => {
  // base 50 + 15 (unlimited) − 10 (1 posted) = 55
  const brand = makeBrand({ monthly_video_quota: 0 });
  const result = computeBrandStats(brand, [makeVideo()], [], []);
  assert.equal(result.health_score, 55);
});

test('content: 2-4 posted → +10', () => {
  // base 50 + 15 (unlimited) + 10 (3 posted) = 75
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = Array.from({ length: 3 }, () => makeVideo());
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 75);
});

test('content: 5+ posted → +20', () => {
  // base 50 + 15 (unlimited) + 20 (5 posted) = 85
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = Array.from({ length: 5 }, () => makeVideo());
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 85);
});

// ── Winners ─────────────────────────────────────────────────────────────────

test('winners: 0 → +0', () => {
  // base 50 + 15 (unlimited) + 20 (5 posted) + 0 = 85
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = Array.from({ length: 5 }, () => makeVideo());
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 85);
});

test('winners: 1-2 → +10', () => {
  // base 50 + 15 + 20 + 10 (2 winners) = 95
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = Array.from({ length: 5 }, () => makeVideo());
  const winners = Array.from({ length: 2 }, () => makeWinner());
  const result = computeBrandStats(brand, videos, [], winners);
  assert.equal(result.health_score, 95);
});

test('winners: 3+ → +20', () => {
  // base 50 + 15 + 20 + 20 (3 winners) = 105 → clamped 100
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = Array.from({ length: 5 }, () => makeVideo());
  const winners = Array.from({ length: 3 }, () => makeWinner());
  const result = computeBrandStats(brand, videos, [], winners);
  assert.equal(result.health_score, 100);
});

// ── Engagement ──────────────────────────────────────────────────────────────

test('engagement: 0-1.9% → +0', () => {
  // 15 likes / 1000 views = 1.5%
  // base 50 + 15 + 20 + 0 (engagement) = 85
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = Array.from({ length: 5 }, () =>
    makeVideo({ tiktok_views: 1000, tiktok_likes: 15 })
  );
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 85);
  assert.equal(result.avg_engagement, 1.5);
});

test('engagement: 2-4.9% → +5', () => {
  // 30 likes / 1000 views = 3%
  // base 50 + 15 + 20 + 5 = 90
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = Array.from({ length: 5 }, () =>
    makeVideo({ tiktok_views: 1000, tiktok_likes: 30 })
  );
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 90);
  assert.equal(result.avg_engagement, 3);
});

test('engagement: 5%+ → +10', () => {
  // 60 likes / 1000 views = 6%
  // base 50 + 15 + 20 + 10 = 95
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = Array.from({ length: 5 }, () =>
    makeVideo({ tiktok_views: 1000, tiktok_likes: 60 })
  );
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 95);
  assert.equal(result.avg_engagement, 6);
});

// ── Score clamping ──────────────────────────────────────────────────────────

test('clamp: score never exceeds 100', () => {
  // 50 + 30 + 20 + 20 + 10 = 130 → 100
  const brand = makeBrand({ monthly_video_quota: 10, videos_this_month: 7 });
  const videos = Array.from({ length: 6 }, () =>
    makeVideo({ tiktok_views: 1000, tiktok_likes: 60 })
  );
  const winners = Array.from({ length: 4 }, () => makeWinner());
  const result = computeBrandStats(brand, videos, [], winners);
  assert.equal(result.health_score, 100);
});

test('clamp: score never below 0', () => {
  // Worst case: 50 − 10 (0% quota) − 10 (0 posted) = 30, still ≥ 0
  const brand = makeBrand({ monthly_video_quota: 10, videos_this_month: 0 });
  const result = computeBrandStats(brand, [], [], []);
  assert.ok(result.health_score >= 0);
  assert.equal(result.health_score, 30);
});

// ── Health labels ───────────────────────────────────────────────────────────

test('label: 0-39 → critical', () => {
  // 50 − 10 − 10 = 30
  const brand = makeBrand({ monthly_video_quota: 10, videos_this_month: 0 });
  const result = computeBrandStats(brand, [], [], []);
  assert.equal(result.health_score, 30);
  assert.equal(result.health_label, 'critical');
});

test('label: 40-59 → needs_attention', () => {
  // 50 + 15 (unlimited) − 10 (0 posted) = 55
  const brand = makeBrand({ monthly_video_quota: 0 });
  const result = computeBrandStats(brand, [], [], []);
  assert.equal(result.health_score, 55);
  assert.equal(result.health_label, 'needs_attention');
});

test('label: 60-79 → good', () => {
  // 50 + 15 (unlimited) + 10 (3 posted) = 75
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = Array.from({ length: 3 }, () => makeVideo());
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 75);
  assert.equal(result.health_label, 'good');
});

test('label: 80+ → excellent', () => {
  // 50 + 15 (unlimited) + 20 (5 posted) = 85
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = Array.from({ length: 5 }, () => makeVideo());
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.health_score, 85);
  assert.equal(result.health_label, 'excellent');
});

// ── Suggested product ───────────────────────────────────────────────────────

test('suggested: picks product with fewest videos', () => {
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = [
    makeVideo({ product_name: 'Alpha' }),
    makeVideo({ product_name: 'Alpha' }),
    makeVideo({ product_name: 'Alpha' }),
    makeVideo({ product_name: 'Beta' }),
  ];
  const products = [
    makeProduct({ id: '1', name: 'Alpha' }),
    makeProduct({ id: '2', name: 'Beta' }),
  ];
  const result = computeBrandStats(brand, videos, products, []);
  assert.equal(result.suggested_product, 'Beta');
});

test('suggested: null when no products', () => {
  const brand = makeBrand({ monthly_video_quota: 0 });
  const result = computeBrandStats(brand, [], [], []);
  assert.equal(result.suggested_product, null);
});

test('suggested: product with zero videos preferred', () => {
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = [
    makeVideo({ product_name: 'Alpha' }),
    makeVideo({ product_name: 'Alpha' }),
  ];
  const products = [
    makeProduct({ id: '1', name: 'Alpha' }),
    makeProduct({ id: '2', name: 'Gamma' }),
  ];
  const result = computeBrandStats(brand, videos, products, []);
  assert.equal(result.suggested_product, 'Gamma');
});

// ── Edge cases ──────────────────────────────────────────────────────────────

test('edge: zero views → engagement 0', () => {
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = [makeVideo({ tiktok_views: 0, tiktok_likes: 10 })];
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.avg_engagement, 0);
});

test('edge: null tiktok fields → engagement 0', () => {
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = [makeVideo({ tiktok_views: null, tiktok_likes: null })];
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.avg_engagement, 0);
});

test('edge: videos for other brands are filtered out', () => {
  const brand = makeBrand({ name: 'MyBrand', monthly_video_quota: 0 });
  const videos = [
    makeVideo({ brand_name: 'OtherBrand' }),
    makeVideo({ brand_name: 'OtherBrand' }),
    makeVideo({ brand_name: 'MyBrand' }),
  ];
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.total_videos, 1);
  assert.equal(result.posted_videos, 1);
});

test('edge: non-posted videos counted in total but not posted', () => {
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = [
    makeVideo({ recording_status: 'POSTED' }),
    makeVideo({ recording_status: 'DRAFT' }),
    makeVideo({ recording_status: 'RECORDING' }),
  ];
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.total_videos, 3);
  assert.equal(result.posted_videos, 1);
});

test('edge: empty arrays for all inputs', () => {
  const brand = makeBrand({ monthly_video_quota: 0 });
  const result = computeBrandStats(brand, [], [], []);
  assert.equal(result.total_videos, 0);
  assert.equal(result.posted_videos, 0);
  assert.equal(result.winner_count, 0);
  assert.equal(result.avg_engagement, 0);
  assert.deepEqual(result.products, []);
  assert.equal(result.suggested_product, null);
});

test('edge: engagement averaged across multiple videos', () => {
  // Video 1: 100/1000 = 10%, Video 2: 20/1000 = 2% → avg = 6%
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = [
    makeVideo({ tiktok_views: 1000, tiktok_likes: 100 }),
    makeVideo({ tiktok_views: 1000, tiktok_likes: 20 }),
  ];
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.avg_engagement, 6);
});

test('edge: mixed engagement — zero-engagement videos excluded from avg', () => {
  // Video 1: 60/1000 = 6%, Video 2: 0 views → 0% (filtered out) → avg = 6%
  const brand = makeBrand({ monthly_video_quota: 0 });
  const videos = [
    makeVideo({ tiktok_views: 1000, tiktok_likes: 60 }),
    makeVideo({ tiktok_views: 0, tiktok_likes: 0 }),
  ];
  const result = computeBrandStats(brand, videos, [], []);
  assert.equal(result.avg_engagement, 6);
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
