#!/usr/bin/env node
/**
 * CC Ingestion End-to-End Test
 *
 * Posts one usage event and one agent run (start + finish) to the
 * Command Center ingest endpoints using CC_INGEST_KEY.
 *
 * Usage:
 *   pnpm run test:ingest
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_APP_URL, CC_INGEST_KEY
 * Or set BASE_URL directly.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const BASE_URL =
  process.env.BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000';

const CC_INGEST_KEY = process.env.CC_INGEST_KEY;

if (!CC_INGEST_KEY) {
  console.error('ERROR: CC_INGEST_KEY is not set. Set it in .env.local or environment.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'x-cc-ingest-key': CC_INGEST_KEY,
};

async function testUsageIngest(): Promise<boolean> {
  console.log('\n--- Test 1: Usage Ingest ---');
  const url = `${BASE_URL}/api/admin/usage/ingest`;
  const body = {
    events: [
      {
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        agent_id: 'test-ingest-script',
        request_type: 'chat',
        input_tokens: 500,
        output_tokens: 200,
        latency_ms: 850,
        status: 'ok',
        meta: { source: 'test-ingest.ts', ts: new Date().toISOString() },
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    const pass = res.ok && json.ok;
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${JSON.stringify(json)}`);
    console.log(`  ${pass ? '\u2705 PASS' : '\u274C FAIL'}`);
    return pass;
  } catch (err) {
    console.log(`  \u274C ERROR: ${err}`);
    return false;
  }
}

async function testAgentRunStartFinish(): Promise<boolean> {
  console.log('\n--- Test 2: Agent Run Start ---');
  const startUrl = `${BASE_URL}/api/admin/command-center/agent-runs/start`;
  const startBody = {
    agent_id: 'test-ingest-script',
    action: 'ingest-test-run',
    model_primary: 'claude-haiku-4-5',
    metadata: { source: 'test-ingest.ts', ts: new Date().toISOString() },
  };

  let runId: string | null = null;
  try {
    const startRes = await fetch(startUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(startBody),
    });
    const startJson = await startRes.json();
    runId = startJson?.data?.run_id ?? null;
    const startPass = startRes.ok && startJson.ok && !!runId;
    console.log(`  Status: ${startRes.status}`);
    console.log(`  Response: ${JSON.stringify(startJson)}`);
    console.log(`  run_id: ${runId}`);
    console.log(`  ${startPass ? '\u2705 PASS' : '\u274C FAIL'}`);

    if (!runId) return false;
  } catch (err) {
    console.log(`  \u274C ERROR: ${err}`);
    return false;
  }

  // Small delay to simulate work
  await new Promise((r) => setTimeout(r, 500));

  console.log('\n--- Test 3: Agent Run Finish ---');
  const finishUrl = `${BASE_URL}/api/admin/command-center/agent-runs/finish`;
  const finishBody = {
    run_id: runId,
    status: 'completed',
    tokens_in: 500,
    tokens_out: 200,
    cost_usd: 0.0012,
    model_used: 'claude-haiku-4-5',
    metadata: { source: 'test-ingest.ts', finished_at: new Date().toISOString() },
  };

  try {
    const finishRes = await fetch(finishUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(finishBody),
    });
    const finishJson = await finishRes.json();
    const finishPass = finishRes.ok && finishJson.ok;
    console.log(`  Status: ${finishRes.status}`);
    console.log(`  Response: ${JSON.stringify(finishJson)}`);
    console.log(`  ${finishPass ? '\u2705 PASS' : '\u274C FAIL'}`);
    return finishPass;
  } catch (err) {
    console.log(`  \u274C ERROR: ${err}`);
    return false;
  }
}

async function testIngestKeyRejection(): Promise<boolean> {
  console.log('\n--- Test 4: Bad Ingest Key Rejected ---');
  const url = `${BASE_URL}/api/admin/usage/ingest`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cc-ingest-key': 'wrong-key-12345',
      },
      body: JSON.stringify({ events: [{ provider: 'test', model: 'test', input_tokens: 1, output_tokens: 1 }] }),
    });
    const rejected = res.status === 401 || res.status === 403 || res.status === 501;
    console.log(`  Status: ${res.status} (expected 401/403/501)`);
    console.log(`  ${rejected ? '\u2705 PASS (correctly rejected)' : '\u274C FAIL (should have been rejected)'}`);
    return rejected;
  } catch (err) {
    console.log(`  \u274C ERROR: ${err}`);
    return false;
  }
}

async function main() {
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`CC_INGEST_KEY: ${CC_INGEST_KEY?.slice(0, 4)}...${CC_INGEST_KEY?.slice(-4)}`);

  const results = [
    await testUsageIngest(),
    await testAgentRunStartFinish(),
    await testIngestKeyRejection(),
  ];

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Ingestion tests: ${passed}/${total} passed`);

  if (passed === total) {
    console.log('\nNext: Open /admin/command-center in your browser.');
    console.log('You should see the test-ingest-script agent run and usage event.');
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
