#!/usr/bin/env npx tsx
/**
 * run-endpoint.ts — call a local cron/API endpoint with CRON_SECRET auth.
 *
 * Usage: npx tsx scripts/workers/run-endpoint.ts <path>
 *   e.g. npx tsx scripts/workers/run-endpoint.ts /api/cron/orchestrator
 *
 * Loads .env.local for CRON_SECRET and APP_PORT (default 3100).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env.local
const envPath = join(__dirname, '..', '..', '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.error('WARN: could not read .env.local');
}

const endpoint = process.argv[2];
if (!endpoint) {
  console.error('Usage: run-endpoint.ts <path>  (e.g. /api/cron/orchestrator)');
  process.exit(1);
}

const cronSecret = process.env.CRON_SECRET;
if (!cronSecret) {
  console.error('ERROR: CRON_SECRET not set in .env.local');
  process.exit(1);
}

const port = process.env.APP_PORT || '3100';
const url = `http://127.0.0.1:${port}${endpoint}`;

async function main() {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const body = await res.text();
    const elapsed = Date.now() - start;
    const preview = body.length > 300 ? body.slice(0, 300) + '…' : body;
    console.log(`${res.status} (${elapsed}ms) ${preview}`);
    process.exit(res.ok ? 0 : 1);
  } catch (err) {
    console.error(`FETCH FAILED: ${err}`);
    process.exit(1);
  }
}

main();
