#!/usr/bin/env npx tsx
/**
 * Stress Test: Script Generation Burst
 *
 * Fires 50 concurrent POST requests to /api/scripts/generate
 * and reports latency percentiles + success/failure rate.
 *
 * Usage:
 *   npx tsx scripts/stress-test/script-burst.ts
 *   npx tsx scripts/stress-test/script-burst.ts --base-url https://flashflowai.com
 *   npx tsx scripts/stress-test/script-burst.ts --concurrency 20
 *
 * Prerequisites:
 *   - test-agency@flashflowai.com account exists with agency plan
 *   - At least one concept exists for that user (will create if missing)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qqyrwwvtxzrwbyqegpme.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeXJ3d3Z0eHpyd2J5cWVncG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3ODAyNDIsImV4cCI6MjA4NDM1NjI0Mn0.gEsqqcVb6eJBRDkIAAIPdkaGTgxXh9AvhrLciK8qbuE';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const BASE_URL = getArg('--base-url') || process.env.BASE_URL || 'http://localhost:3000';
const CONCURRENCY = parseInt(getArg('--concurrency') || '50');
const TEST_EMAIL = 'test-agency@flashflowai.com';
const TEST_PASSWORD = 'FlashFlow2026!';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function percentile(sorted: number[], p: number): number {
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, i)];
}

interface RequestResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  error?: string;
}

async function main() {
  console.log('=== Script Generation Burst Test ===');
  console.log(`Target:      ${BASE_URL}/api/scripts/generate`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('');

  // 1. Sign in to get session
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
  const userId = authData.user.id;
  console.log(`Authenticated as ${userId.slice(0, 8)}...`);

  // 2. Find or create a concept for this user
  console.log('Finding/creating test concept...');
  const adminSb = SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY)
    : supabase;

  let { data: concepts } = await adminSb
    .from('concepts')
    .select('id')
    .limit(1);

  let conceptId: string;
  if (concepts && concepts.length > 0) {
    conceptId = concepts[0].id;
  } else {
    // Create a test concept
    const { data: newConcept, error: conceptErr } = await adminSb
      .from('concepts')
      .insert({
        concept_title: 'Stress Test Product',
        core_angle: 'A revolutionary test product for stress testing',
        status: 'draft',
      })
      .select('id')
      .single();

    if (conceptErr || !newConcept) {
      console.error('FAIL: Could not create concept:', conceptErr?.message);
      process.exit(1);
    }
    conceptId = newConcept.id;
  }

  console.log(`Using concept: ${conceptId.slice(0, 8)}...`);
  console.log('');

  // 3. Fire concurrent requests
  console.log(`Firing ${CONCURRENCY} concurrent requests...`);
  const startAll = Date.now();

  const promises: Promise<RequestResult>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    promises.push(fireRequest(accessToken, conceptId, i));
  }

  const results = await Promise.all(promises);
  const totalMs = Date.now() - startAll;

  // 4. Analyze results
  const successes = results.filter(r => r.ok);
  const failures = results.filter(r => !r.ok);
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);

  console.log('');
  console.log('=== RESULTS ===');
  console.log(`Total time:   ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Success:      ${successes.length}/${CONCURRENCY} (${((successes.length / CONCURRENCY) * 100).toFixed(0)}%)`);
  console.log(`Failures:     ${failures.length}`);
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
    console.log('Failure breakdown:');
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
  const passRate = successes.length / CONCURRENCY;
  // Rate limit is 10/min so we expect many 429s with 50 concurrent.
  // PASS if at least some succeed and rate limiting is working.
  if (passRate >= 0.1 && failures.some(f => f.status === 429)) {
    console.log('PASS: Rate limiting correctly applied. Some requests succeeded, excess were throttled.');
  } else if (passRate >= 0.8) {
    console.log('PASS: High success rate under load.');
  } else if (passRate > 0) {
    console.log('WARN: Low success rate. Check server capacity.');
  } else {
    console.log('FAIL: All requests failed.');
    process.exit(1);
  }
}

async function fireRequest(token: string, conceptId: string, index: number): Promise<RequestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/scripts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        concept_id: conceptId,
        hook_text: `What if I told you this changes everything? (test ${index})`,
        category_risk: 'general',
      }),
    });

    const latencyMs = Date.now() - start;
    let error: string | undefined;

    try {
      const json = await res.json();
      if (!json.ok) error = json.error;
    } catch {
      error = 'Invalid JSON response';
    }

    return { ok: res.ok, status: res.status, latencyMs, error };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
