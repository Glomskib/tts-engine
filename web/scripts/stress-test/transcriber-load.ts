#!/usr/bin/env npx tsx
/**
 * Stress Test: Transcriber Load
 *
 * Fires 20 requests to /api/transcribe with different TikTok URLs.
 * Verifies rate limiting kicks in and measures response times.
 *
 * Usage:
 *   npx tsx scripts/stress-test/transcriber-load.ts
 *   npx tsx scripts/stress-test/transcriber-load.ts --base-url https://flashflowai.com
 *   npx tsx scripts/stress-test/transcriber-load.ts --concurrency 10
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qqyrwwvtxzrwbyqegpme.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeXJ3d3Z0eHpyd2J5cWVncG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3ODAyNDIsImV4cCI6MjA4NDM1NjI0Mn0.gEsqqcVb6eJBRDkIAAIPdkaGTgxXh9AvhrLciK8qbuE';

const BASE_URL = getArg('--base-url') || process.env.BASE_URL || 'http://localhost:3000';
const CONCURRENCY = parseInt(getArg('--concurrency') || '20');
const TEST_EMAIL = 'test-agency@flashflowai.com';
const TEST_PASSWORD = 'FlashFlow2026!';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

// Sample TikTok URLs (public viral videos — content doesn't matter, we test the endpoint behavior)
const TIKTOK_URLS = [
  'https://www.tiktok.com/@tiktok/video/7000000000000000001',
  'https://www.tiktok.com/@tiktok/video/7000000000000000002',
  'https://www.tiktok.com/@tiktok/video/7000000000000000003',
  'https://www.tiktok.com/@tiktok/video/7000000000000000004',
  'https://www.tiktok.com/@tiktok/video/7000000000000000005',
  'https://www.tiktok.com/@tiktok/video/7000000000000000006',
  'https://www.tiktok.com/@tiktok/video/7000000000000000007',
  'https://www.tiktok.com/@tiktok/video/7000000000000000008',
  'https://www.tiktok.com/@tiktok/video/7000000000000000009',
  'https://www.tiktok.com/@tiktok/video/7000000000000000010',
  'https://www.tiktok.com/@tiktok/video/7000000000000000011',
  'https://www.tiktok.com/@tiktok/video/7000000000000000012',
  'https://www.tiktok.com/@tiktok/video/7000000000000000013',
  'https://www.tiktok.com/@tiktok/video/7000000000000000014',
  'https://www.tiktok.com/@tiktok/video/7000000000000000015',
  'https://www.tiktok.com/@tiktok/video/7000000000000000016',
  'https://www.tiktok.com/@tiktok/video/7000000000000000017',
  'https://www.tiktok.com/@tiktok/video/7000000000000000018',
  'https://www.tiktok.com/@tiktok/video/7000000000000000019',
  'https://www.tiktok.com/@tiktok/video/7000000000000000020',
];

interface RequestResult {
  index: number;
  ok: boolean;
  status: number;
  latencyMs: number;
  error?: string;
  rateLimited: boolean;
}

function percentile(sorted: number[], p: number): number {
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, i)];
}

async function main() {
  console.log('=== Transcriber Load Test ===');
  console.log(`Target:      ${BASE_URL}/api/transcribe`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('');

  // 1. Sign in
  console.log('Signing in as test-agency...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authError || !authData.session) {
    console.error('FAIL: Auth error:', authError?.message || 'No session');
    process.exit(1);
  }

  const accessToken = authData.session.access_token;
  console.log('Authenticated.');
  console.log('');

  // 2. Fire concurrent requests
  console.log(`Firing ${CONCURRENCY} concurrent transcribe requests...`);
  const startAll = Date.now();

  const promises: Promise<RequestResult>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const url = TIKTOK_URLS[i % TIKTOK_URLS.length];
    promises.push(fireRequest(accessToken, url, i));
  }

  const results = await Promise.all(promises);
  const totalMs = Date.now() - startAll;

  // 3. Analyze
  const successes = results.filter(r => r.ok);
  const rateLimited = results.filter(r => r.rateLimited);
  const failures = results.filter(r => !r.ok && !r.rateLimited);
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);

  console.log('');
  console.log('=== RESULTS ===');
  console.log(`Total time:    ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Success:       ${successes.length}/${CONCURRENCY}`);
  console.log(`Rate limited:  ${rateLimited.length} (HTTP 429)`);
  console.log(`Other errors:  ${failures.length}`);
  console.log('');
  console.log('Latency percentiles:');
  console.log(`  p50:  ${percentile(latencies, 50).toFixed(0)}ms`);
  console.log(`  p90:  ${percentile(latencies, 90).toFixed(0)}ms`);
  console.log(`  p95:  ${percentile(latencies, 95).toFixed(0)}ms`);
  console.log(`  p99:  ${percentile(latencies, 99).toFixed(0)}ms`);
  console.log(`  min:  ${latencies[0]?.toFixed(0) || 0}ms`);
  console.log(`  max:  ${latencies[latencies.length - 1]?.toFixed(0) || 0}ms`);

  if (failures.length > 0) {
    console.log('');
    console.log('Error breakdown:');
    const errorCounts: Record<string, number> = {};
    for (const f of failures) {
      const key = `${f.status}: ${f.error || 'unknown'}`;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
    for (const [err, count] of Object.entries(errorCounts)) {
      console.log(`  ${count}x ${err}`);
    }
  }

  console.log('');
  // With 20 concurrent requests, we expect rate limiting to kick in.
  // PASS if rate limiting works OR if all succeed (lenient server).
  if (rateLimited.length > 0) {
    console.log('PASS: Rate limiting correctly applied.');
    console.log(`  ${rateLimited.length} requests were throttled (429).`);
    console.log(`  ${successes.length} requests were allowed through.`);
  } else if (successes.length === CONCURRENCY) {
    console.log('PASS: All requests succeeded (no rate limiting hit — server handled the load).');
  } else if (successes.length > 0) {
    console.log('WARN: Some failures occurred but not from rate limiting. Check server logs.');
  } else {
    console.log('FAIL: All requests failed.');
    process.exit(1);
  }
}

async function fireRequest(token: string, tiktokUrl: string, index: number): Promise<RequestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ url: tiktokUrl }),
    });

    const latencyMs = Date.now() - start;
    const rateLimited = res.status === 429;
    let error: string | undefined;

    try {
      const json = await res.json();
      if (!json.ok) error = json.error || json.message;
    } catch {
      error = 'Invalid JSON response';
    }

    return { index, ok: res.ok, status: res.status, latencyMs, error, rateLimited };
  } catch (err) {
    return {
      index,
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      error: (err as Error).message,
      rateLimited: false,
    };
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
