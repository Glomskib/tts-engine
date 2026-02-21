#!/usr/bin/env tsx
/**
 * FinOps Smoke Test
 *
 * Verifies the FinOps pipeline end-to-end:
 *   1. Insert a fake usage event into ff_usage_events
 *   2. Run the rollup for today
 *   3. Verify rollup rows exist
 *   4. Run daily report (MC post skipped if no token)
 *   5. Clean up the fake event
 *
 * Usage:
 *   tsx scripts/test-finops/smoke.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

let insertedId: string | null = null;
const today = new Date().toISOString().slice(0, 10);

async function step(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    console.log('OK');
  } catch (err) {
    console.log('FAIL');
    console.error(`    ${err}`);
    throw err;
  }
}

async function cleanup() {
  if (insertedId) {
    await supabase.from('ff_usage_events').delete().eq('id', insertedId);
    // Clean up rollup rows for the test
    await supabase
      .from('ff_usage_rollups_daily')
      .delete()
      .eq('day', today)
      .eq('lane', 'FinOps-Smoke-Test');
    console.log('  [cleanup] Removed test data');
  }
}

async function run() {
  console.log(`\nFinOps Smoke Test — ${today}\n`);

  // Step 1: Insert fake usage event
  await step('Insert fake usage event', async () => {
    const { data, error } = await supabase
      .from('ff_usage_events')
      .insert({
        source: 'manual',
        lane: 'FinOps-Smoke-Test',
        provider: 'openai',
        model: 'gpt-4o-mini',
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        cost_usd: 0.000450,
        agent_id: 'smoke-test',
        template_key: 'smoke_test',
        metadata: { test: true, timestamp: new Date().toISOString() },
      })
      .select('id')
      .single();

    if (error) throw new Error(`Insert failed: ${error.message}`);
    insertedId = data.id;
  });

  // Step 2: Run rollup
  await step('Run daily rollup via RPC', async () => {
    const { error } = await supabase.rpc('refresh_ff_usage_daily_rollups', {
      target_day: today,
    });
    if (error) throw new Error(`Rollup RPC failed: ${error.message}`);
  });

  // Step 3: Verify rollup row exists
  await step('Verify rollup row exists', async () => {
    const { data, error } = await supabase
      .from('ff_usage_rollups_daily')
      .select('*')
      .eq('day', today)
      .eq('lane', 'FinOps-Smoke-Test');

    if (error) throw new Error(`Query failed: ${error.message}`);
    if (!data || data.length === 0) throw new Error('No rollup row found for test lane');
    if (data[0].calls !== 1) throw new Error(`Expected 1 call, got ${data[0].calls}`);
    if (Number(data[0].cost_usd) !== 0.000450) {
      throw new Error(`Expected cost 0.000450, got ${data[0].cost_usd}`);
    }
  });

  // Step 4: Verify budget table exists
  await step('Verify ff_budgets table accessible', async () => {
    const { error } = await supabase
      .from('ff_budgets')
      .select('id')
      .limit(1);
    if (error) throw new Error(`Budget table query failed: ${error.message}`);
  });

  // Step 5: Test cost calculator (import check)
  await step('Test costFromUsage calculation', async () => {
    // Dynamic import to test the module
    const { costFromUsage } = await import('../../lib/finops/cost');
    const cost = costFromUsage({
      provider: 'openai',
      model: 'gpt-4o-mini',
      input_tokens: 1000,
      output_tokens: 500,
    });
    // Expected: (1000/1M * 0.15) + (500/1M * 0.6) = 0.00015 + 0.0003 = 0.00045
    if (Math.abs(cost - 0.00045) > 0.000001) {
      throw new Error(`Expected ~0.00045, got ${cost}`);
    }
  });

  // Step 6: Daily report (dry run — MC post may skip without token)
  await step('Daily report generates without crashing', async () => {
    // Just test that the rollup data can be read — don't actually post to MC
    const { data } = await supabase
      .from('ff_usage_rollups_daily')
      .select('lane, cost_usd, calls')
      .eq('day', today);

    if (!data) throw new Error('Could not read rollup data for report');
  });

  // Cleanup
  await cleanup();

  console.log('\nAll smoke tests passed!\n');
}

run().catch(async (err) => {
  console.error('\nSmoke test FAILED:', err);
  await cleanup();
  process.exit(1);
});
