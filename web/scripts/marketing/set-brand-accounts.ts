#!/usr/bin/env tsx
/**
 * Set Brand Accounts — Upsert marketing_brand_accounts from a local JSON file.
 *
 * Usage:
 *   npx tsx scripts/marketing/set-brand-accounts.ts                        # uses brand-accounts.local.json
 *   npx tsx scripts/marketing/set-brand-accounts.ts --file my-accounts.json
 *   npx tsx scripts/marketing/set-brand-accounts.ts --dry-run              # preview only
 *
 * JSON format: see brand-accounts.local.example.json
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const TAG = '[set-brand-accounts]';
const DEFAULT_FILE = 'brand-accounts.local.json';

interface BrandAccountRow {
  brand: string;
  platform: string;
  account_id: string;
  page_id?: string | null;
  enabled?: boolean;
  meta?: Record<string, unknown>;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  let file: string | undefined;
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) file = args[fileIdx + 1];

  return { dryRun, file };
}

async function main() {
  const { dryRun, file } = parseArgs();

  const filePath = resolve(process.cwd(), file || DEFAULT_FILE);

  console.log(`${TAG} Brand Account Configurator`);
  console.log(`${TAG} File: ${filePath}`);
  console.log(`${TAG} Dry run: ${dryRun}`);

  if (!existsSync(filePath)) {
    console.error(`${TAG} File not found: ${filePath}`);
    console.error(`${TAG} Copy brand-accounts.local.example.json to brand-accounts.local.json and fill in real IDs.`);
    process.exit(1);
  }

  let accounts: BrandAccountRow[];
  try {
    const raw = readFileSync(filePath, 'utf-8');
    accounts = JSON.parse(raw);
  } catch (err) {
    console.error(`${TAG} Invalid JSON:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (!Array.isArray(accounts) || accounts.length === 0) {
    console.error(`${TAG} JSON must be a non-empty array`);
    process.exit(1);
  }

  // Validate each entry
  for (const a of accounts) {
    if (!a.brand || !a.platform || !a.account_id) {
      console.error(`${TAG} Invalid entry (missing brand/platform/account_id):`, JSON.stringify(a));
      process.exit(1);
    }
    if (a.account_id.startsWith('YOUR_')) {
      console.error(`${TAG} Placeholder detected — replace "${a.account_id}" with a real Late.dev account ID`);
      process.exit(1);
    }
  }

  console.log(`${TAG} ${accounts.length} accounts to upsert:`);
  for (const a of accounts) {
    const pageInfo = a.page_id ? ` (page: ${a.page_id})` : '';
    console.log(`  ${a.brand} / ${a.platform} → ${a.account_id}${pageInfo}`);
  }
  console.log('');

  if (dryRun) {
    console.log(`${TAG} DRY RUN — would upsert ${accounts.length} rows. No changes made.`);
    process.exit(0);
  }

  // Connect to Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error(`${TAG} Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let upserted = 0;
  let errors = 0;

  for (const a of accounts) {
    const { error } = await supabase
      .from('marketing_brand_accounts')
      .upsert(
        {
          brand: a.brand,
          platform: a.platform,
          account_id: a.account_id,
          page_id: a.page_id || null,
          enabled: a.enabled ?? true,
          meta: a.meta || {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'brand,platform' },
      );

    if (error) {
      console.error(`  ERROR ${a.brand}/${a.platform}: ${error.message}`);
      errors++;
    } else {
      console.log(`  OK ${a.brand}/${a.platform}`);
      upserted++;
    }
  }

  console.log('');
  console.log(`${TAG} === Summary ===`);
  console.log(`${TAG} Upserted: ${upserted}`);
  console.log(`${TAG} Errors: ${errors}`);

  // Verify
  const { data: verify } = await supabase
    .from('marketing_brand_accounts')
    .select('brand, platform, account_id, page_id, enabled')
    .order('brand')
    .order('platform');

  if (verify) {
    console.log('');
    console.log(`${TAG} Current brand accounts in DB (${verify.length} rows):`);
    for (const row of verify) {
      const status = row.enabled ? '✓' : '✗';
      const page = row.page_id ? ` page=${row.page_id}` : '';
      console.log(`  ${status} ${row.brand} / ${row.platform} → ${row.account_id}${page}`);
    }
  }
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
