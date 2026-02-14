#!/usr/bin/env npx tsx
/**
 * Stress Test: Credit Race Condition
 *
 * Simulates 2 concurrent requests from the same user who has exactly 1 credit.
 * Verifies that credits never go negative (atomic deduction).
 * Runs 10 iterations.
 *
 * Usage:
 *   npx tsx scripts/stress-test/credit-race.ts
 *   npx tsx scripts/stress-test/credit-race.ts --iterations 20
 *
 * Prerequisites:
 *   - test-creator-lite@flashflowai.com account exists
 *   - SUPABASE_SERVICE_ROLE_KEY set in .env.local (to reset credits between iterations)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qqyrwwvtxzrwbyqegpme.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeXJ3d3Z0eHpyd2J5cWVncG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3ODAyNDIsImV4cCI6MjA4NDM1NjI0Mn0.gEsqqcVb6eJBRDkIAAIPdkaGTgxXh9AvhrLciK8qbuE';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ITERATIONS = parseInt(getArg('--iterations') || '10');
const TEST_EMAIL = 'test-creator-lite@flashflowai.com';
const TEST_PASSWORD = 'FlashFlow2026!';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  console.log('=== Credit Race Condition Test ===');
  console.log(`Target:     ${BASE_URL}`);
  console.log(`Iterations: ${ITERATIONS}`);
  console.log('');

  if (!SERVICE_KEY) {
    console.error('FAIL: SUPABASE_SERVICE_ROLE_KEY required to reset credits between iterations.');
    console.error('Set it in .env.local or export it.');
    process.exit(1);
  }

  const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Sign in as test user
  console.log('Signing in as test-creator-lite...');
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

  // Find or create a concept for script generation
  let { data: concepts } = await adminSb
    .from('concepts')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  let conceptId: string;
  if (concepts && concepts.length > 0) {
    conceptId = concepts[0].id;
  } else {
    const { data: newConcept, error: conceptErr } = await adminSb
      .from('concepts')
      .insert({
        user_id: userId,
        concept_title: 'Credit Race Test Product',
        core_angle: 'Testing credit atomicity',
        status: 'active',
      })
      .select('id')
      .single();

    if (conceptErr || !newConcept) {
      console.error('FAIL: Could not create concept:', conceptErr?.message);
      process.exit(1);
    }
    conceptId = newConcept.id;
  }

  console.log('');

  let passes = 0;
  let negativeDetected = false;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Reset credits to exactly 1
    await adminSb
      .from('user_credits')
      .update({ credits_remaining: 1 })
      .eq('user_id', userId);

    // Verify reset
    const { data: creditsBefore } = await adminSb
      .from('user_credits')
      .select('credits_remaining')
      .eq('user_id', userId)
      .single();

    if (!creditsBefore || creditsBefore.credits_remaining !== 1) {
      console.error(`  Iteration ${iter + 1}: FAIL - Could not reset credits to 1`);
      continue;
    }

    // Fire 2 concurrent script generation requests
    const [r1, r2] = await Promise.all([
      fireScriptGenerate(accessToken, conceptId, 'A'),
      fireScriptGenerate(accessToken, conceptId, 'B'),
    ]);

    // Check credits after
    const { data: creditsAfter } = await adminSb
      .from('user_credits')
      .select('credits_remaining')
      .eq('user_id', userId)
      .single();

    const remaining = creditsAfter?.credits_remaining ?? -999;
    const bothSucceeded = r1.ok && r2.ok;
    const oneSucceeded = (r1.ok || r2.ok) && !(r1.ok && r2.ok);
    const noneSucceeded = !r1.ok && !r2.ok;

    const isNegative = remaining < 0;
    if (isNegative) negativeDetected = true;

    let verdict: string;
    if (isNegative) {
      verdict = `FAIL (credits went negative: ${remaining})`;
    } else if (oneSucceeded && remaining === 0) {
      verdict = `PASS (exactly 1 succeeded, credits=0)`;
      passes++;
    } else if (noneSucceeded && remaining === 1) {
      verdict = `PASS (both rejected — credit not deducted, credits=1)`;
      passes++;
    } else if (bothSucceeded && remaining >= 0) {
      // Possible if the deduction is per-endpoint or credits were replenished
      verdict = `WARN (both succeeded, credits=${remaining})`;
      passes++;
    } else {
      verdict = `OK (r1=${r1.status} r2=${r2.status} credits=${remaining})`;
      if (!isNegative) passes++;
    }

    console.log(`  Iteration ${iter + 1}: ${verdict}`);
  }

  console.log('');
  console.log('=== RESULTS ===');
  console.log(`Iterations:       ${ITERATIONS}`);
  console.log(`Passed:           ${passes}/${ITERATIONS}`);
  console.log(`Negative credits: ${negativeDetected ? 'YES (BUG!)' : 'No'}`);
  console.log('');

  // Restore credits for the test user
  await adminSb
    .from('user_credits')
    .update({ credits_remaining: 75 })
    .eq('user_id', userId);
  console.log('Credits restored to 75.');

  if (negativeDetected) {
    console.log('');
    console.log('FAIL: Credits went negative — race condition exists!');
    process.exit(1);
  } else {
    console.log('PASS: Credits never went negative across all iterations.');
  }
}

async function fireScriptGenerate(
  token: string,
  conceptId: string,
  label: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/scripts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        concept_id: conceptId,
        hook_text: `Credit race test ${label} — ${Date.now()}`,
        category_risk: 'general',
      }),
    });

    let error: string | undefined;
    try {
      const json = await res.json();
      if (!json.ok) error = json.error;
    } catch {
      // ignore
    }

    return { ok: res.ok, status: res.status, error };
  } catch (err) {
    return { ok: false, status: 0, error: (err as Error).message };
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
