#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * Rekey ff_session_status rows from hostname-based node_name to FF_NODE_ID.
 *
 * Reads all rows where node_name matches any known hostname variant,
 * upserts a copy under FF_NODE_ID, and optionally deletes the old row.
 *
 * Usage:
 *   npx tsx scripts/tiktok-studio/rekey-session-status.ts              # dry run (default)
 *   npx tsx scripts/tiktok-studio/rekey-session-status.ts --apply      # apply changes
 *   npx tsx scripts/tiktok-studio/rekey-session-status.ts --apply --delete-old  # apply + remove old rows
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as os from 'os';
import { createClient } from '@supabase/supabase-js';

const TAG = '[rekey-session-status]';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`${TAG} SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const FF_NODE_ID = process.env.FF_NODE_ID;
if (!FF_NODE_ID) {
  console.error(`${TAG} FF_NODE_ID env var is required. Set it in .env.local first.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const deleteOld = args.includes('--delete-old');

async function main() {
  const currentHostname = os.hostname();

  console.log(`\n${'='.repeat(55)}`);
  console.log('  Rekey ff_session_status — hostname → FF_NODE_ID');
  console.log(`${'='.repeat(55)}`);
  console.log(`  FF_NODE_ID:       ${FF_NODE_ID}`);
  console.log(`  Current hostname: ${currentHostname}`);
  console.log(`  Mode:             ${apply ? (deleteOld ? 'APPLY + DELETE OLD' : 'APPLY') : 'DRY RUN'}`);
  console.log(`${'='.repeat(55)}\n`);

  // 1. Fetch all rows — we'll find any that don't match FF_NODE_ID
  const { data: allRows, error: fetchErr } = await supabase
    .from('ff_session_status')
    .select('*')
    .order('updated_at', { ascending: false });

  if (fetchErr) {
    console.error(`${TAG} Failed to fetch rows:`, fetchErr.message);
    process.exit(1);
  }

  if (!allRows || allRows.length === 0) {
    console.log(`${TAG} No rows in ff_session_status. Nothing to rekey.`);
    return;
  }

  console.log(`${TAG} Found ${allRows.length} total row(s):\n`);
  for (const row of allRows) {
    const marker = row.node_name === FF_NODE_ID ? '  (already correct)' : '  ← needs rekey';
    console.log(`  node_name="${row.node_name}" platform="${row.platform}" valid=${row.is_valid} reason="${row.reason}"${marker}`);
  }

  // 2. Identify rows that need rekeying (node_name != FF_NODE_ID)
  const toRekey = allRows.filter((r) => r.node_name !== FF_NODE_ID);

  if (toRekey.length === 0) {
    console.log(`\n${TAG} All rows already use FF_NODE_ID="${FF_NODE_ID}". No changes needed.`);
    return;
  }

  console.log(`\n${TAG} ${toRekey.length} row(s) to rekey → "${FF_NODE_ID}"\n`);

  if (!apply) {
    console.log(`${TAG} DRY RUN — no changes made. Re-run with --apply to execute.`);
    return;
  }

  // 3. Upsert each row under FF_NODE_ID
  let upserted = 0;
  let deleted = 0;

  for (const row of toRekey) {
    const { id: _id, created_at: _created, ...rest } = row;

    console.log(`${TAG} Rekeying: node_name="${row.node_name}" platform="${row.platform}" → "${FF_NODE_ID}"`);

    const { error: upsertErr } = await supabase
      .from('ff_session_status')
      .upsert(
        {
          ...rest,
          node_name: FF_NODE_ID,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'node_name,platform', ignoreDuplicates: false },
      );

    if (upsertErr) {
      console.error(`${TAG}   FAILED: ${upsertErr.message}`);
      continue;
    }

    upserted++;
    console.log(`${TAG}   Upserted OK`);

    // 4. Optionally delete the old row
    if (deleteOld) {
      const { error: delErr } = await supabase
        .from('ff_session_status')
        .delete()
        .eq('id', row.id);

      if (delErr) {
        console.error(`${TAG}   Delete old row FAILED: ${delErr.message}`);
      } else {
        deleted++;
        console.log(`${TAG}   Deleted old row (id=${row.id})`);
      }
    }
  }

  console.log(`\n${TAG} Done: ${upserted} upserted, ${deleted} deleted.`);
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
