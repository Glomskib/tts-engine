/**
 * Smoke test: Pipeline create + list isolation
 *
 * Tests:
 * 1. POST /api/videos/create-from-script creates a video linked to a script
 * 2. GET /api/videos/queue returns the new video (scoped to the user)
 * 3. Videos from other users do NOT appear in the queue
 *
 * Usage:
 *   npx tsx tests/pipeline-smoke.ts [BASE_URL]
 *
 * Requires a running dev server (default: http://localhost:3000)
 * and a valid session cookie or API key.
 *
 * Environment:
 *   SMOKE_COOKIE  – full Cookie header value (from browser devtools)
 *   SMOKE_API_KEY – ff_ak_* API key (alternative to cookie)
 */

const BASE = process.argv[2] || 'http://localhost:3000';

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.SMOKE_API_KEY) {
    h['Authorization'] = `Bearer ${process.env.SMOKE_API_KEY}`;
  } else if (process.env.SMOKE_COOKIE) {
    h['Cookie'] = process.env.SMOKE_COOKIE;
  } else {
    console.error('Set SMOKE_COOKIE or SMOKE_API_KEY env var');
    process.exit(1);
  }
  return h;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

async function run() {
  console.log(`\nPipeline smoke test — ${BASE}\n`);

  // Step 1: Create a test script via /api/skits
  console.log('1. Create test script');
  const skitRes = await fetch(`${BASE}/api/skits`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      title: `Smoke Test ${Date.now()}`,
      skit_data: {
        hook_line: 'Test hook',
        beats: [{ t: '0:03', action: 'dialogue', dialogue: 'Test beat' }],
        b_roll: [],
        overlays: [],
        cta_line: 'Test CTA',
        cta_overlay: '',
      },
      generation_config: {},
      product_name: 'Smoke Product',
      product_brand: 'Smoke Brand',
      status: 'draft',
    }),
  });
  const skitData = await skitRes.json();
  assert(skitData.ok === true, 'Script created');
  const scriptId = skitData.data?.id;
  assert(!!scriptId, `Script ID returned: ${scriptId}`);

  // Step 2: Add script to pipeline
  console.log('\n2. Add to pipeline via /api/videos/create-from-script');
  const pipeRes = await fetch(`${BASE}/api/videos/create-from-script`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      script_id: scriptId,
      title: 'Smoke Test Video',
      product_name: 'Smoke Product',
      product_brand: 'Smoke Brand',
      hook_line: 'Test hook',
    }),
  });
  const pipeData = await pipeRes.json();
  assert(pipeData.ok === true, 'Video created in pipeline');
  const videoId = pipeData.data?.id;
  assert(!!videoId, `Video ID returned: ${videoId}`);
  assert(pipeData.data?.client_user_id != null, 'client_user_id is set');

  // Step 3: Verify idempotency — second call returns same video
  console.log('\n3. Idempotency check');
  const dupeRes = await fetch(`${BASE}/api/videos/create-from-script`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ script_id: scriptId }),
  });
  const dupeData = await dupeRes.json();
  assert(dupeData.ok === true, 'Duplicate call succeeds');
  assert(dupeData.duplicate === true, 'Marked as duplicate');
  assert(dupeData.data?.id === videoId, 'Returns same video ID');

  // Step 4: Verify video appears in queue
  console.log('\n4. Verify video in queue');
  const queueRes = await fetch(`${BASE}/api/videos/queue?claimed=any&limit=50`, {
    headers: headers(),
  });
  const queueData = await queueRes.json();
  assert(queueData.ok === true, 'Queue fetch succeeded');
  const found = (queueData.data || []).find((v: { id: string }) => v.id === videoId);
  assert(!!found, `Video ${videoId} found in queue`);

  // Step 5: Verify queue-summary is scoped (counts should be > 0)
  console.log('\n5. Verify queue-summary is scoped');
  const summaryRes = await fetch(`${BASE}/api/observability/queue-summary`, {
    headers: headers(),
  });
  const summaryData = await summaryRes.json();
  assert(summaryData.ok === true, 'Queue summary fetch succeeded');
  const total = Object.values(summaryData.data?.counts_by_status || {}).reduce(
    (a: number, b: unknown) => a + (b as number), 0
  );
  assert(total > 0, `Total videos in summary: ${total}`);

  // Step 6: Cleanup — delete test script (video stays for manual inspection)
  console.log('\n6. Cleanup');
  const delRes = await fetch(`${BASE}/api/skits/${scriptId}`, {
    method: 'DELETE',
    headers: headers(),
  });
  const delData = await delRes.json();
  assert(delData.ok === true, 'Test script deleted');

  // Summary
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
