#!/usr/bin/env tsx
/**
 * Retry failed marketing posts within a date range.
 *
 * Usage:
 *   npx tsx scripts/marketing/retry-failed.ts                         # last 24h
 *   npx tsx scripts/marketing/retry-failed.ts --from 2026-03-01       # since date
 *   npx tsx scripts/marketing/retry-failed.ts --from 2026-03-01 --to 2026-03-03
 *   npx tsx scripts/marketing/retry-failed.ts --dry-run               # preview only
 *   npx tsx scripts/marketing/retry-failed.ts --id <post-uuid>        # retry specific post
 *
 * Sets meta.retry_requested=true on FAILED posts so the scheduler picks them up.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const TAG = '[retry-failed]';

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  let from: string | undefined;
  let to: string | undefined;
  let id: string | undefined;

  const fromIdx = args.indexOf('--from');
  if (fromIdx !== -1 && args[fromIdx + 1]) from = args[fromIdx + 1];

  const toIdx = args.indexOf('--to');
  if (toIdx !== -1 && args[toIdx + 1]) to = args[toIdx + 1];

  const idIdx = args.indexOf('--id');
  if (idIdx !== -1 && args[idIdx + 1]) id = args[idIdx + 1];

  // Default: last 24h
  if (!from && !id) {
    from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  }

  return { from, to, dryRun, id };
}

async function main() {
  const { from, to, dryRun, id } = parseArgs();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error(`${TAG} Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  console.log(`${TAG} Searching for failed posts...`);
  if (id) console.log(`${TAG} Specific post: ${id}`);
  else console.log(`${TAG} Date range: ${from || 'any'} → ${to || 'now'}`);
  console.log(`${TAG} Dry run: ${dryRun}`);

  // Build query
  let query = supabase
    .from('marketing_posts')
    .select('id, content, status, error, created_at, meta')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(50);

  if (id) {
    query = query.eq('id', id);
  } else {
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
  }

  const { data: posts, error: fetchErr } = await query;

  if (fetchErr) {
    console.error(`${TAG} Query error:`, fetchErr.message);
    process.exit(1);
  }

  if (!posts || posts.length === 0) {
    console.log(`${TAG} No failed posts found in range.`);
    process.exit(0);
  }

  console.log(`${TAG} Found ${posts.length} failed post(s):\n`);

  for (const p of posts) {
    const errorClass = p.meta?.last_error_class || 'unknown';
    const attempts = p.meta?.attempts || 0;
    const preview = p.content.slice(0, 80).replace(/\n/g, ' ');
    console.log(`  ${p.id} | ${errorClass} | ${attempts} attempts | ${p.created_at}`);
    console.log(`    Error: ${(p.error || 'none').slice(0, 120)}`);
    console.log(`    Content: ${preview}...`);
    console.log('');
  }

  if (dryRun) {
    console.log(`${TAG} DRY RUN — would flag ${posts.length} post(s) for retry.`);
    process.exit(0);
  }

  // Set retry_requested=true
  let flagged = 0;
  for (const p of posts) {
    const { error: updateErr } = await supabase
      .from('marketing_posts')
      .update({
        meta: { ...(p.meta || {}), retry_requested: true, retry_flagged_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq('id', p.id);

    if (updateErr) {
      console.error(`${TAG} Failed to flag ${p.id}: ${updateErr.message}`);
    } else {
      flagged++;
    }
  }

  console.log(`${TAG} Flagged ${flagged}/${posts.length} post(s) for retry.`);
  console.log(`${TAG} The marketing-scheduler cron will pick them up on next run.`);
  console.log(`${TAG} To trigger immediately: curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/marketing-scheduler`);
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
