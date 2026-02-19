#!/usr/bin/env tsx
/**
 * Run the idea file artifacts migration.
 * Usage: npx tsx scripts/run-migration.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const envPath = join(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        // Strip quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log('Checking if migration is already applied...');

  // Check if columns exist by querying them
  const { error: checkErr } = await sb
    .from('idea_artifacts')
    .select('id, label, storage_path, content_type, extracted_text, summary')
    .limit(1);

  if (!checkErr) {
    console.log('Columns already exist — migration already applied.');
    return;
  }

  console.log('Columns not found:', checkErr.message);
  console.log('\nPlease run this SQL in your Supabase Dashboard SQL Editor:');
  console.log('Dashboard > SQL Editor > New Query > Paste & Run\n');
  console.log('='.repeat(60));
  console.log(readFileSync(
    join(process.cwd(), 'supabase/migrations/20260218_idea_file_artifacts.sql'),
    'utf-8'
  ));
  console.log('='.repeat(60));
  console.log('\nThen re-run this script to verify.');
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
