#!/usr/bin/env node
/**
 * API Smoke Test - Verify all key API routes return valid responses.
 *
 * Usage:
 *   node scripts/api-smoke-test.mjs
 *   node scripts/api-smoke-test.mjs --base-url https://your-app.vercel.app
 *   node scripts/api-smoke-test.mjs --cookie "sb-access-token=..."
 *
 * Requires: Server running (default http://localhost:3000)
 */

const BASE_URL = (() => {
  const idx = process.argv.indexOf('--base-url');
  return idx !== -1 && process.argv[idx + 1]
    ? process.argv[idx + 1]
    : process.env.BASE_URL || 'http://localhost:3000';
})();

const AUTH_COOKIE = (() => {
  const idx = process.argv.indexOf('--cookie');
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : '';
})();

// Routes to test
const routes = [
  // Public (no auth required)
  { method: 'GET', path: '/api/health', auth: false, expect: 200 },

  // Auth-required routes (will return 401 without cookie)
  { method: 'GET', path: '/api/auth/me', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/products', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/brands', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/winners', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/saved-hooks', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/credits', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/credits/packages', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/skits', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/scripts', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/hooks', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/concepts', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/collections', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/auth/plan-status', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/subscriptions/status', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/videos', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/audience/personas', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/audience/pain-points', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/dashboard/stats', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
  { method: 'GET', path: '/api/analytics/winners', auth: true, expect: AUTH_COOKIE ? 200 : 401 },

  // Observability (auth required)
  { method: 'GET', path: '/api/observability/health', auth: true, expect: AUTH_COOKIE ? 200 : 401 },
];

async function testRoute(route) {
  const url = `${BASE_URL}${route.path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_COOKIE) {
    headers['Cookie'] = AUTH_COOKIE;
  }

  try {
    const res = await fetch(url, { method: route.method, headers });
    const status = res.status;
    const pass = status === route.expect;
    const icon = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';

    console.log(
      `  ${icon} ${route.method.padEnd(6)} ${route.path.padEnd(40)} ${status} ${!pass ? `(expected ${route.expect})` : ''}`
    );
    return { ...route, status, pass };
  } catch (err) {
    console.log(
      `  \x1b[31mERROR\x1b[0m ${route.method.padEnd(6)} ${route.path.padEnd(40)} ${err.message}`
    );
    return { ...route, status: 0, pass: false, error: err.message };
  }
}

async function run() {
  console.log('=== API Smoke Test ===');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Auth: ${AUTH_COOKIE ? 'provided' : 'none (auth routes will expect 401)'}`);
  console.log(`Routes: ${routes.length}`);
  console.log('');

  const results = [];
  for (const route of routes) {
    results.push(await testRoute(route));
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log('');
  console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} routes`);

  if (failed > 0) {
    console.log('');
    console.log('Failed routes:');
    results
      .filter((r) => !r.pass)
      .forEach((r) => {
        console.log(`  ${r.method} ${r.path} - got ${r.status}, expected ${r.expect}`);
      });
    process.exit(1);
  }

  console.log('\nAll routes responding correctly.');
}

run();
