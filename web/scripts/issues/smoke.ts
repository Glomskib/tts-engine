#!/usr/bin/env tsx
/**
 * Issue Intake + Triage smoke test.
 *
 * Usage:
 *   SMOKE_TEST_TOKEN=<admin-jwt-or-ff_ak_key> npx tsx scripts/issues/smoke.ts
 *   SMOKE_TEST_TOKEN=<token> npx tsx scripts/issues/smoke.ts --base http://localhost:3000
 *
 * - Intake endpoint is open (no auth needed).
 * - Triage endpoint requires admin auth via SMOKE_TEST_TOKEN.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = join(process.cwd(), '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  } catch {
    // .env.local not found — rely on environment
  }
}

loadEnv();

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:3000';

const TOKEN = process.env.SMOKE_TEST_TOKEN;
if (!TOKEN) {
  console.error(
    'Set SMOKE_TEST_TOKEN to a valid admin Bearer token (Supabase JWT or ff_ak_* key).\n' +
    'Example: SMOKE_TEST_TOKEN=eyJ... npx tsx scripts/issues/smoke.ts'
  );
  process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function main() {
  const ts = Date.now();
  const testMessage = `[smoke-test] Video generation fails with 500 on /api/pipeline/auto-generate (ts=${ts})`;

  // ── Step 1: Create an issue (no auth needed) ──────────────────────────────
  console.log('\n1) POST /api/flashflow/issues/intake — create issue');

  const intakeRes = await fetch(`${BASE}/api/flashflow/issues/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'api',
      reporter: 'smoke-test@flashflow.ai',
      message_text: testMessage,
      context_json: { path: '/api/pipeline/auto-generate', status: 500, smoke: true },
    }),
  });

  const intakeJson = await intakeRes.json();
  assert('Status 201', intakeRes.status === 201, `got ${intakeRes.status}`);
  assert('ok: true', intakeJson.ok === true, JSON.stringify(intakeJson));
  assert('deduplicated: false', intakeJson.deduplicated === false);
  assert('issue returned', !!intakeJson.issue?.id);

  const issueId = intakeJson.issue?.id;
  console.log(`   issue_id: ${issueId}`);

  // ── Step 2: Dedupe — same message should return existing issue ────────────
  console.log('\n2) POST /api/flashflow/issues/intake — deduplicate');

  const dedupeRes = await fetch(`${BASE}/api/flashflow/issues/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'api',
      reporter: 'smoke-test@flashflow.ai',
      message_text: testMessage,
      context_json: { attempt: 2 },
    }),
  });

  const dedupeJson = await dedupeRes.json();
  assert('Status 200', dedupeRes.status === 200, `got ${dedupeRes.status}`);
  assert('ok: true', dedupeJson.ok === true);
  assert('deduplicated: true', dedupeJson.deduplicated === true);
  assert('Same issue_id', dedupeJson.issue?.id === issueId, `got ${dedupeJson.issue?.id}`);

  // ── Step 3: Run triage (admin auth required) ──────────────────────────────
  console.log('\n3) POST /api/flashflow/issues/triage/run — triage');

  const triageRes = await fetch(`${BASE}/api/flashflow/issues/triage/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
  });

  const triageJson = await triageRes.json();
  assert('Status 200', triageRes.status === 200, `got ${triageRes.status}`);
  assert('ok: true', triageJson.ok === true, JSON.stringify(triageJson));
  assert('triaged >= 1', (triageJson.triaged ?? 0) >= 1, `triaged: ${triageJson.triaged}`);

  if (triageJson.results?.length > 0) {
    const r = triageJson.results[0];
    console.log(`   severity: ${r.severity}, subsystem: ${r.subsystem}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
