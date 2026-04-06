/**
 * Apply a SQL migration to the remote Supabase database.
 *
 * Usage: npx tsx scripts/apply-migration.ts <migration-file>
 *
 * Requires DATABASE_URL env var or SUPABASE_DB_PASSWORD.
 * If missing, prompts with the Supabase dashboard URL.
 *
 * Alternatively: copy the SQL and paste into the Supabase SQL editor:
 *   https://supabase.com/dashboard/project/qqyrwwvtxzrwbyqegpme/sql/new
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';

config({ path: '.env.local' });

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: npx tsx scripts/apply-migration.ts <migration-file>');
  process.exit(1);
}

const sql = readFileSync(migrationFile, 'utf8');

const DATABASE_URL = process.env.DATABASE_URL;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const PROJECT_REF = 'qqyrwwvtxzrwbyqegpme';

async function applyWithPg(connectionString: string) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('Migration applied successfully!');
}

async function main() {
  if (DATABASE_URL) {
    console.log('Applying via DATABASE_URL...');
    await applyWithPg(DATABASE_URL);
    return;
  }

  if (DB_PASSWORD) {
    const connStr = `postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;
    console.log('Applying via DB password...');
    await applyWithPg(connStr);
    return;
  }

  console.log('');
  console.log('No DATABASE_URL or SUPABASE_DB_PASSWORD found.');
  console.log('');
  console.log('Option 1: Paste the migration SQL into the Supabase SQL editor:');
  console.log(`  https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
  console.log(`  File: ${migrationFile}`);
  console.log('');
  console.log('Option 2: Add DATABASE_URL to .env.local:');
  console.log(`  DATABASE_URL=postgresql://postgres.${PROJECT_REF}:<password>@aws-0-us-west-1.pooler.supabase.com:6543/postgres`);
  console.log('  (Get the password from Supabase Dashboard > Settings > Database)');
  console.log('');
  console.log('Option 3: Add SUPABASE_DB_PASSWORD to .env.local');
  console.log('');

  // Copy SQL to clipboard on macOS
  try {
    const { execSync } = await import('child_process');
    execSync('pbcopy', { input: sql });
    console.log('SQL has been copied to your clipboard. Paste it into the SQL editor.');
  } catch {
    console.log('Could not copy to clipboard. Open the migration file and paste manually.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
