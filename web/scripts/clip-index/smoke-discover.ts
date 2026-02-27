/**
 * Smoke test: Clip Discover
 *
 * Calls the /api/cron/clip-discover endpoint locally.
 * Requires: CRON_SECRET env var (from .env.local or exported).
 *
 * Usage:
 *   npx tsx scripts/clip-index/smoke-discover.ts
 *   BASE_URL=https://flashflow.ai npx tsx scripts/clip-index/smoke-discover.ts
 */

export {};

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

async function main() {
  if (!CRON_SECRET) {
    console.error('\x1b[31mError:\x1b[0m CRON_SECRET env var is required');
    process.exit(1);
  }

  const url = `${BASE_URL}/api/cron/clip-discover`;
  console.log(`\x1b[36m[clip-discover]\x1b[0m ${url}`);
  console.log('');

  const start = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const elapsed = Date.now() - start;
  const body = await res.json();
  const ok = res.status === 200 && body.ok;

  if (ok) {
    console.log(`\x1b[32mPASS\x1b[0m  ${res.status} in ${elapsed}ms`);
    console.log(`  found:       ${body.found}`);
    console.log(`  inserted:    ${body.inserted}`);
    console.log(`  deduped:     ${body.deduped}`);
    console.log(`  queries_run: ${body.queries_run}`);
    console.log(`  errors:      ${body.errors?.length ?? 0}`);
    if (body.errors?.length > 0) {
      console.log(`  error list:  ${body.errors.join('; ')}`);
    }
  } else {
    console.log(`\x1b[31mFAIL\x1b[0m  ${res.status} in ${elapsed}ms`);
    console.log(JSON.stringify(body, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\x1b[31mFATAL:\x1b[0m', err);
  process.exit(1);
});
