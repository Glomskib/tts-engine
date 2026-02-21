/**
 * Smoke tests for the FlashFlow self-improvement loop API.
 *
 * Usage:
 *   npx tsx scripts/test-flashflow-loop/smoke.ts
 *
 * Requires the dev server running (npm run dev) and a valid admin session
 * token or API key set via SMOKE_TEST_TOKEN env var.
 *
 * Tests:
 *  1. POST /api/flashflow/generations — happy path
 *  2. POST /api/flashflow/generations — auth failure (no token)
 *  3. PATCH /api/flashflow/generations/:id — happy path
 *  4. POST /api/flashflow/generations/:id/events — happy path
 *  5. POST /api/flashflow/outcomes — happy path (upsert)
 *  6. GET /api/flashflow/weekly-report — happy path
 *  7. POST /api/flashflow/weekly-trainer/run — happy path
 *  8. GET /api/flashflow/weekly-report — auth failure (no token)
 */

export {};

const BASE = process.env.SMOKE_TEST_BASE_URL || 'http://localhost:3000';
const TOKEN = process.env.SMOKE_TEST_TOKEN;

if (!TOKEN) {
  console.error(
    'Set SMOKE_TEST_TOKEN to a valid admin Bearer token (Supabase JWT or ff_ak_* key).\n' +
    'Example: SMOKE_TEST_TOKEN=eyJ... npx tsx scripts/test-flashflow-loop/smoke.ts'
  );
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`,
};

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${name}: ${msg}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function run() {
  console.log('\nFlashFlow Self-Improvement Loop — Smoke Tests\n');
  console.log(`Base URL: ${BASE}`);
  console.log(`Token:    ${TOKEN!.slice(0, 12)}...\n`);

  let generationId = '';

  // 1. Create generation (happy path)
  await test('POST /generations — creates generation', async () => {
    const res = await fetch(`${BASE}/api/flashflow/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        template_id: 'smoke_test_hook',
        prompt_version: '0.0.1-test',
        inputs_json: { product: 'Test Widget', platform: 'tiktok' },
        output_text: 'This is a smoke test hook output.',
        model: 'smoke-test',
        latency_ms: 42,
      }),
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    const json = await res.json();
    assert(json.ok === true, 'Expected ok: true');
    assert(typeof json.data.id === 'string', 'Expected id');
    generationId = json.data.id;
  });

  // 2. Create generation (auth failure)
  await test('POST /generations — rejects unauthenticated', async () => {
    const res = await fetch(`${BASE}/api/flashflow/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: 'test' }),
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  // 3. PATCH generation
  await test('PATCH /generations/:id — updates generation', async () => {
    assert(!!generationId, 'No generation id from step 1');
    const res = await fetch(`${BASE}/api/flashflow/generations/${generationId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'rejected' }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.data.status === 'rejected', 'Expected status=rejected');
  });

  // 4. POST event
  await test('POST /generations/:id/events — logs event', async () => {
    assert(!!generationId, 'No generation id from step 1');
    const res = await fetch(`${BASE}/api/flashflow/generations/${generationId}/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event_type: 'rejected',
        payload: { reason: 'smoke test rejection' },
      }),
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    const json = await res.json();
    assert(json.ok === true, 'Expected ok: true');
  });

  // 5. POST outcome (upsert)
  await test('POST /outcomes — upserts outcome', async () => {
    assert(!!generationId, 'No generation id from step 1');
    const res = await fetch(`${BASE}/api/flashflow/outcomes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        generation_id: generationId,
        rating: 2,
        is_rejected: true,
        feedback_text: 'Smoke test: too generic',
        tags: ['too-generic', 'smoke-test'],
      }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.ok === true, 'Expected ok: true');
    assert(json.data.rating === 2, 'Expected rating 2');
  });

  // 6. GET weekly-report
  await test('GET /weekly-report — returns aggregates', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const res = await fetch(
      `${BASE}/api/flashflow/weekly-report?start=${weekAgo}&end=${today}`,
      { headers }
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.ok === true, 'Expected ok: true');
    assert(typeof json.data.total_generations === 'number', 'Expected total_generations');
  });

  // 7. POST weekly-trainer/run
  await test('POST /weekly-trainer/run — runs trainer', async () => {
    const res = await fetch(`${BASE}/api/flashflow/weekly-trainer/run`, {
      method: 'POST',
      headers,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.ok === true, 'Expected ok: true');
    assert(typeof json.data.total_generations === 'number', 'Expected total_generations');
    // MC posting may fail if MC is not running, that's OK
    console.log(`    (MC posted: ${json.data.mc_posted}, error: ${json.data.mc_error ?? 'none'})`);
  });

  // 8. GET weekly-report (auth failure)
  await test('GET /weekly-report — rejects unauthenticated', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(
      `${BASE}/api/flashflow/weekly-report?start=2026-01-01&end=${today}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  // Summary
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
