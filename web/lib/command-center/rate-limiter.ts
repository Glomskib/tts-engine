/**
 * Lightweight in-memory token bucket rate limiter for ingest endpoints.
 * Prevents accidental loops from spamming. Not distributed — per-process only.
 *
 * Usage:
 *   import { checkRateLimit } from '@/lib/command-center/rate-limiter';
 *   const result = checkRateLimit('ingest', ip);
 *   if (!result.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

// Config: 60 requests per minute per key
const MAX_TOKENS = 60;
const REFILL_INTERVAL_MS = 60_000; // 1 minute
const REFILL_AMOUNT = 60;

// Cleanup old buckets every 5 minutes to prevent memory leak
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60_000;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - 10 * 60_000; // remove buckets idle for 10 min
  for (const [key, bucket] of buckets) {
    if (bucket.lastRefill < cutoff) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(
  namespace: string,
  key: string,
): { allowed: boolean; remaining: number } {
  cleanup();

  const bucketKey = `${namespace}:${key}`;
  const now = Date.now();

  let bucket = buckets.get(bucketKey);
  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefill: now };
    buckets.set(bucketKey, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= REFILL_INTERVAL_MS) {
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + REFILL_AMOUNT);
    bucket.lastRefill = now;
  }

  if (bucket.tokens > 0) {
    bucket.tokens--;
    return { allowed: true, remaining: bucket.tokens };
  }

  return { allowed: false, remaining: 0 };
}
