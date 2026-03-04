#!/usr/bin/env tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * Slot-Aware RI Ingestion Wrapper
 *
 * Loads the slot config, applies env vars (FF_CLIENT_ID, FF_SLOT),
 * then delegates to the standard run-ingestion pipeline with
 * --user <client_id> to scope DB reads/writes.
 *
 * Usage:
 *   npm run ri:ingest:slot -- --slot wife
 *   npm run ri:ingest:slot -- --slot wife --simulate
 *   npm run ri:ingest:slot -- --slot wife --dry-run
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { requireSlot, applySlotEnv } from '../../lib/client-slots';
import { execFileSync } from 'child_process';
import * as path from 'path';

const TAG = '[ri:ingest:slot]';

function main() {
  const slot = requireSlot();
  applySlotEnv(slot);

  console.log(`${TAG} Running RI ingestion for slot: ${slot.slot}`);
  console.log(`${TAG} Scoped to client_id: ${slot.client_id}`);
  console.log('');

  // Forward remaining args (strip --slot <name>)
  const args = process.argv.slice(2);
  const slotIdx = args.indexOf('--slot');
  if (slotIdx !== -1) {
    args.splice(slotIdx, 2); // remove --slot and its value
  }

  // Build the command: run the standard ingestion with --user scoping
  const tsxPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const scriptPath = path.join(process.cwd(), 'scripts', 'revenue-intelligence', 'run-ingestion.ts');

  const execArgs = [scriptPath, '--user', slot.client_id, ...args];

  console.log(`${TAG} Executing: tsx ${execArgs.join(' ')}`);
  console.log('');

  try {
    execFileSync(tsxPath, execArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        FF_CLIENT_ID: slot.client_id,
        FF_SLOT: slot.slot,
        FF_CHROME_PROFILE_DIR: slot.chrome_profile_dir,
      },
      cwd: process.cwd(),
    });
  } catch (err: any) {
    if (err.status) {
      process.exit(err.status);
    }
    throw err;
  }
}

main();
