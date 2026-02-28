#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script
/**
 * Run the Revenue Intelligence migration via Supabase Management API.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';

const TAG = '[ri:migrate]';

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN || process.argv[2];
  const projectRef = 'qqyrwwvtxzrwbyqegpme';

  if (!accessToken) {
    console.error(`${TAG} Provide SUPABASE_ACCESS_TOKEN env var or pass as first arg`);
    process.exit(1);
  }

  const sqlPath = path.join(
    process.cwd(),
    'supabase/migrations/20260328000001_revenue_intelligence.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log(`${TAG} Running migration via Management API...`);

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    console.error(`${TAG} API error ${response.status}: ${text}`);
    process.exit(1);
  }

  const result = await response.json();
  console.log(`${TAG} Migration executed successfully!`);
  if (Array.isArray(result)) {
    console.log(`${TAG} ${result.length} result set(s) returned`);
  }
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
