#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script
/**
 * Revenue Intelligence – Fix PostgREST Schema Cache
 *
 * 1. Verifies ri_run_state columns exist in the actual DB
 * 2. Triggers PostgREST schema reload via NOTIFY
 * 3. Verifies the columns are accessible through the Supabase client
 *
 * Usage:
 *   npx tsx scripts/revenue-intelligence/fix-schema-cache.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const TAG = '[ri:schema-fix]';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(`${TAG} Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log(`${TAG} Checking ri_run_state schema...\n`);

  // Step 1: Verify columns exist via information_schema
  const { data: columns, error: colErr } = await supabase
    .from('information_schema.columns' as any)
    .select('column_name, data_type, is_nullable')
    .eq('table_schema', 'public')
    .eq('table_name', 'ri_run_state');

  // information_schema may not be exposed via PostgREST, so fall back to RPC
  if (colErr) {
    console.log(`${TAG} information_schema not accessible via REST (expected on hosted Supabase).`);
    console.log(`${TAG} Falling back to direct column probes...\n`);
  } else if (columns) {
    console.log(`${TAG} ri_run_state columns in DB:`);
    for (const col of columns) {
      console.log(`  - ${col.column_name} (${col.data_type}, nullable=${col.is_nullable})`);
    }
    console.log('');
  }

  // Step 2: Probe each expected column via Supabase client
  const expectedColumns = [
    'user_id',
    'last_ingested_at',
    'last_alert_sent_at',
    'last_alert_summary',
    'updated_at',
  ];

  let allOk = true;
  for (const col of expectedColumns) {
    const { error } = await supabase
      .from('ri_run_state')
      .select(col, { head: true, count: 'exact' });

    if (error) {
      const isSchemaCache = error.message?.includes('schema cache') || error.code === 'PGRST204';
      console.log(`  ❌ ${col} — ${isSchemaCache ? 'SCHEMA CACHE STALE' : error.message}`);
      allOk = false;
    } else {
      console.log(`  ✅ ${col} — accessible`);
    }
  }

  if (allOk) {
    console.log(`\n${TAG} All columns accessible. No schema cache issue detected.`);
    process.exit(0);
  }

  // Step 3: Apply the migration SQL directly (idempotent)
  console.log(`\n${TAG} Applying migration (ADD COLUMN IF NOT EXISTS)...`);
  const { error: migErr } = await supabase.rpc('exec_sql' as any, {
    sql: `
      ALTER TABLE public.ri_run_state
        ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_alert_summary JSONB;
    `,
  });

  if (migErr) {
    // exec_sql RPC may not exist — that's OK, the columns may already exist in the actual DB
    // and we just need the schema cache reloaded
    console.log(`${TAG} RPC exec_sql not available (expected). Columns likely exist but PostgREST cache is stale.`);
  } else {
    console.log(`${TAG} Migration applied.`);
  }

  // Step 4: Trigger PostgREST schema reload
  console.log(`${TAG} Triggering PostgREST schema reload...`);
  const { error: notifyErr } = await supabase.rpc('exec_sql' as any, {
    sql: "NOTIFY pgrst, 'reload schema';",
  });

  if (notifyErr) {
    console.log(`${TAG} Could not trigger reload via RPC. Try manually in Supabase SQL Editor:`);
    console.log(`\n  NOTIFY pgrst, 'reload schema';\n`);
    console.log(`${TAG} Or restart PostgREST from the Supabase dashboard (Settings > API > Reload Schema).`);
  } else {
    console.log(`${TAG} Schema reload triggered.`);
  }

  // Step 5: Re-probe after reload (give it a moment)
  console.log(`\n${TAG} Waiting 2s for schema reload...`);
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log(`${TAG} Re-checking columns...`);
  let fixedCount = 0;
  for (const col of expectedColumns) {
    const { error } = await supabase
      .from('ri_run_state')
      .select(col, { head: true, count: 'exact' });

    if (error) {
      console.log(`  ❌ ${col} — still failing: ${error.message}`);
    } else {
      console.log(`  ✅ ${col} — fixed`);
      fixedCount++;
    }
  }

  if (fixedCount === expectedColumns.length) {
    console.log(`\n${TAG} ✅ All columns now accessible. Schema cache fixed.`);
  } else {
    console.log(`\n${TAG} ⚠️  Some columns still failing. Manual intervention needed:`);
    console.log(`  1. Open Supabase Dashboard → SQL Editor`);
    console.log(`  2. Run:`);
    console.log(`     ALTER TABLE public.ri_run_state`);
    console.log(`       ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMPTZ,`);
    console.log(`       ADD COLUMN IF NOT EXISTS last_alert_summary JSONB;`);
    console.log(`     NOTIFY pgrst, 'reload schema';`);
    console.log(`  3. Re-run this script to verify.`);
  }
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
