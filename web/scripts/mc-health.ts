#!/usr/bin/env tsx
/**
 * CLI: pnpm run mc:health
 *
 * Prints normalized Mission Control pipeline health as JSON.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { fetchPipelineHealth } from '../lib/mc/pipelineHealth';

async function main() {
  const result = await fetchPipelineHealth();
  console.log(JSON.stringify(result, null, 2));
}

main();
