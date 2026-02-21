#!/usr/bin/env tsx
/**
 * FinOps Daily Rollup
 *
 * Aggregates ff_usage_events into ff_usage_rollups_daily for a given day.
 * Idempotent: deletes + re-inserts for the target day (via SQL function).
 *
 * Usage:
 *   tsx scripts/finops/rollup-daily.ts              # rolls up today
 *   tsx scripts/finops/rollup-daily.ts 2026-02-19   # rolls up specific day
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

async function rollup(day: string) {
  console.log(`[finops/rollup] Rolling up day: ${day}`);

  const { error } = await supabase.rpc('refresh_ff_usage_daily_rollups', {
    target_day: day,
  });

  if (error) {
    console.error('[finops/rollup] RPC error:', error.message);
    process.exit(1);
  }

  // Verify
  const { data: rows, error: verifyErr } = await supabase
    .from('ff_usage_rollups_daily')
    .select('lane, provider, model, calls, cost_usd')
    .eq('day', day);

  if (verifyErr) {
    console.error('[finops/rollup] Verify error:', verifyErr.message);
  } else {
    console.log(`[finops/rollup] ${rows?.length ?? 0} rollup rows for ${day}`);
    if (rows && rows.length > 0) {
      const total = rows.reduce((sum, r) => sum + Number(r.cost_usd), 0);
      console.log(`[finops/rollup] Total cost: $${total.toFixed(6)}`);
    }
  }

  console.log('[finops/rollup] Done.');
}

const targetDay = process.argv[2] || new Date().toISOString().slice(0, 10);
rollup(targetDay);
