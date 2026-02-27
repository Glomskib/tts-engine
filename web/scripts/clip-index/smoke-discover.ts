/**
 * Smoke test: Clip Discover
 *
 * Calls the /api/cron/clip-discover endpoint locally.
 * Requires: CRON_SECRET env var (from .env.local or exported).
 *
 * Usage:
 *   npx tsx scripts/clip-index/smoke-discover.ts
 */

export {};

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

async function main() {
  if (!CRON_SECRET) {
    console.error('CRON_SECRET env var is required. Export it or add to .env.local');
    process.exit(1);
  }

  console.log(`Calling ${BASE_URL}/api/cron/clip-discover ...`);

  const res = await fetch(`${BASE_URL}/api/cron/clip-discover`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });

  const body = await res.json();

  console.log(`Status: ${res.status}`);
  console.log(JSON.stringify(body, null, 2));

  if (!res.ok) {
    console.error('FAIL');
    process.exit(1);
  }

  console.log('PASS');
}

main().catch((err) => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
