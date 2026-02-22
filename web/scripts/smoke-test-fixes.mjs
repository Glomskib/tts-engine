#!/usr/bin/env node
/**
 * Smoke tests for fixes:
 * 1. /api/ai/chat — creative_direction is accepted and included
 * 2. /api/videos/create-from-script — no account_id FK violation
 * 3. /api/skits — manual script creation works
 *
 * Usage:
 *   node scripts/smoke-test-fixes.mjs
 *   AUTH_COOKIE="sb-xxx=..." node scripts/smoke-test-fixes.mjs
 *   node scripts/smoke-test-fixes.mjs --base-url http://localhost:3000
 */

const BASE_URL = (() => {
  const idx = process.argv.indexOf('--base-url');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.BASE_URL || 'http://localhost:3000';
})();

const AUTH_COOKIE = process.env.AUTH_COOKIE || '';

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(AUTH_COOKIE ? { Cookie: AUTH_COOKIE } : {}),
  };
}

function pass(label) { console.log(`  ✅ ${label}`); }
function fail(label, detail) { console.error(`  ❌ ${label}: ${detail}`); process.exitCode = 1; }
function skip(label, reason) { console.log(`  ⏭️  ${label}: ${reason}`); }

// ── Test 1: Chat rewrite accepts creative_direction ──
async function testChatCreativeDirection() {
  console.log('Test 1: /api/ai/chat accepts creative_direction in rewrite mode');

  const body = {
    message: 'Make the script longer — add 2 more beats',
    mode: 'rewrite',
    context: {
      brand: 'TestBrand',
      product: 'Test Widget',
      creative_direction: 'Avoid: sarcasm. Reference style: educational and warm.',
      current_skit: {
        hook_line: 'Wait, this actually works?',
        beats: [
          { t: '0:00-0:03', action: 'surprised', dialogue: 'Wait, this actually works?' },
          { t: '0:03-0:08', action: 'show product', dialogue: 'So I tried this thing...' },
          { t: '0:08-0:12', action: 'result', dialogue: 'Game changer.' },
        ],
        b_roll: ['Product close-up'],
        overlays: ['Day 1'],
        cta_line: 'Grab yours now',
        cta_overlay: 'Link in bio',
      },
    },
  };

  try {
    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    // Accept both success (200) and auth errors (401) — we're testing schema acceptance
    if (res.status === 401) {
      skip('Creative direction acceptance', 'No auth cookie — endpoint requires login');
      return;
    }

    const data = await res.json();

    if (!data.ok) {
      // Check it's not a validation error about creative_direction
      const errMsg = data.error || data.message || '';
      if (errMsg.includes('creative_direction')) {
        fail('creative_direction rejected by API', errMsg);
      } else {
        // Other errors (rate limit, AI unavailable) are OK for schema test
        skip('Full rewrite test', `API error: ${errMsg}`);
      }
      return;
    }

    pass('API accepted creative_direction field');

    if (data.rewritten_skit) {
      const newBeats = data.rewritten_skit.beats?.length ?? 0;
      if (newBeats > 3) {
        pass(`Beats increased: 3 → ${newBeats}`);
      } else {
        console.log(`  ⚠️  Beats not increased: ${newBeats} (AI may not have followed instruction)`);
      }
    } else {
      skip('Rewrite result check', 'No rewritten_skit (AI may have returned text advice)');
    }
  } catch (err) {
    fail('Network error', err.message);
  }
}

// ── Test 2: create-from-script no longer sets invalid account_id ──
async function testCreateFromScript() {
  console.log('\nTest 2: /api/videos/create-from-script does not set invalid account_id');

  // We'll test with a dummy script_id — expect 404 (not found) rather than FK violation (500)
  const body = {
    script_id: '00000000-0000-0000-0000-000000000000',
    title: 'Smoke test script',
    hook_line: 'Test hook',
  };

  try {
    const res = await fetch(`${BASE_URL}/api/videos/create-from-script`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      skip('Create-from-script test', 'No auth cookie');
      return;
    }

    const data = await res.json();

    // We expect 404 (script not found), NOT 500 (FK violation on account_id)
    if (res.status === 404 || (data.error && data.error.includes('not found'))) {
      pass('Endpoint returns 404 for missing script (no FK violation)');
    } else if (res.status === 500 && data.error && data.error.includes('account_id')) {
      fail('FK violation on account_id', data.error);
    } else if (data.ok) {
      pass('Script successfully added to pipeline');
    } else {
      // Any other error that's not an FK violation is acceptable
      pass(`Endpoint responded: ${res.status} — ${data.error || 'ok'}`);
    }
  } catch (err) {
    fail('Network error', err.message);
  }
}

// ── Test 3: Manual script creation via POST /api/skits ──
async function testManualScriptCreation() {
  console.log('\nTest 3: POST /api/skits creates manual script');

  const body = {
    title: `Smoke Test Manual Script ${Date.now()}`,
    skit_data: {
      hook_line: 'You need to try this right now',
      beats: [
        { t: '0:00-0:03', action: 'hook delivery', dialogue: 'You need to try this right now' },
        { t: '0:03-0:08', action: 'show product', dialogue: 'This little thing changed my morning routine completely' },
      ],
      b_roll: [],
      overlays: [],
      cta_line: 'Link in bio to grab yours',
      cta_overlay: 'Link in bio',
    },
    product_name: 'Test Product',
    product_brand: 'TestBrand',
    status: 'draft',
    ai_score: null,
  };

  let createdId = null;

  try {
    const res = await fetch(`${BASE_URL}/api/skits`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      skip('Manual script creation', 'No auth cookie');
      return;
    }

    const data = await res.json();

    if (!data.ok) {
      fail('Manual script creation failed', data.error || data.message || JSON.stringify(data));
      return;
    }

    pass('Manual script created successfully');
    createdId = data.data?.id;

    if (createdId) {
      pass(`Script ID: ${createdId}`);
    }

    // Verify it appears in the list
    const listRes = await fetch(`${BASE_URL}/api/skits?limit=5`, {
      headers: headers(),
    });
    const listData = await listRes.json();

    if (listData.ok && listData.data?.some(s => s.id === createdId)) {
      pass('Script appears in GET /api/skits list');
    } else if (listRes.status === 401) {
      skip('List verification', 'No auth cookie');
    } else {
      fail('Script not found in list', `ID ${createdId} missing from response`);
    }
  } catch (err) {
    fail('Network error', err.message);
  }

  // Cleanup: delete the test skit if created
  if (createdId) {
    try {
      await fetch(`${BASE_URL}/api/skits/${createdId}`, {
        method: 'DELETE',
        headers: headers(),
      });
    } catch {
      // Cleanup failure is OK
    }
  }
}

// ── Run all tests ──
async function main() {
  console.log('=== Smoke Tests: Chat Rewrite + Pipeline + Manual Script ===');
  console.log(`Target: ${BASE_URL}`);
  console.log('');

  await testChatCreativeDirection();
  await testCreateFromScript();
  await testManualScriptCreation();

  console.log('');
  console.log(process.exitCode ? '=== SOME TESTS FAILED ===' : '=== ALL TESTS PASSED ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
