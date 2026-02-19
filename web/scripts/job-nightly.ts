#!/usr/bin/env tsx
/**
 * Nightly Idea Researcher – CLI runner.
 *
 * Usage:
 *   pnpm run job:nightly
 *   pnpm run job:nightly -- --dry-run
 *   pnpm run job:nightly -- --limit 5
 *   pnpm run job:nightly -- --dry-run --limit 2
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

// Load env from .env.local if present
import { config } from 'dotenv';
config({ path: '.env.local' });

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  let limit = 10;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    const parsed = parseInt(args[limitIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = parsed;
    }
  }

  return { dryRun, limit };
}

async function main() {
  const { dryRun, limit } = parseArgs();

  console.log(`[job:nightly] Starting at ${new Date().toISOString()}`);
  console.log(`[job:nightly] Dry run: ${dryRun}, Limit: ${limit}`);

  // Validate required env vars
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('[job:nightly] ERROR: NEXT_PUBLIC_SUPABASE_URL not set');
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[job:nightly] ERROR: SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }

  // Dynamic import to avoid loading Supabase before env is set
  const { runNightlyIdeaResearch } = await import('../lib/command-center/nightly-job');

  const result = await runNightlyIdeaResearch(dryRun, limit);

  // Print log
  for (const line of result.log) {
    console.log(line);
  }

  console.log(`\n[job:nightly] Summary: processed=${result.processed} queued_runs=${result.queued_runs} artifacts_ingested=${result.artifacts_ingested} errors=${result.errors}`);

  process.exit(result.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[job:nightly] Fatal error:', err);
  process.exit(1);
});
