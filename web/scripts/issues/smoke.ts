#!/usr/bin/env tsx
/**
 * Issue Intake + Triage smoke test.
 *
 * Usage:
 *   npx tsx scripts/issues/smoke.ts
 *   npx tsx scripts/issues/smoke.ts --base http://localhost:3000
 *
 * Requires FF_ISSUES_SECRET in .env.local (or set as env var).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Load env ────────────────────────────────────────────────────────────────
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

const SECRET = process.env.FF_ISSUES_SECRET;
if (!SECRET) {
  console.error('FF_ISSUES_SECRET not set. Add it to .env.local or export it.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SECRET}`,
};

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

// ── Step 1: Create an issue ─────────────────────────────────────────────────
console.log('\n1) POST /api/flashflow/issues/intake');

const intakeRes = await fetch(`${BASE}/api/flashflow/issues/intake`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    source: 'api',
    reporter: 'smoke-test@flashflow.ai',
    message_text: `[smoke-test] Video generation fails with 500 on /api/pipeline/auto-generate (ts=${Date.now()})`,
    context: { path: '/api/pipeline/auto-generate', status: 500, smoke: true },
    severity: 'medium',
  }),
});

const intakeJson = await intakeRes.json();
assert('Status 200', intakeRes.status === 200, `got ${intakeRes.status}`);
assert('ok: true', intakeJson.ok === true, JSON.stringify(intakeJson));
assert('issue_id returned', !!intakeJson.issue_id);

const issueId = intakeJson.issue_id;
console.log(`   issue_id: ${issueId}`);

// ── Step 2: Dedupe — same message should return same issue ──────────────────
console.log('\n2) POST /api/flashflow/issues/intake (dedupe)');

const dedupeRes = await fetch(`${BASE}/api/flashflow/issues/intake`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    source: 'api',
    reporter: 'smoke-test@flashflow.ai',
    message_text: `[smoke-test] Video generation fails with 500 on /api/pipeline/auto-generate (ts=${Date.now()})`,
    context: { path: '/api/pipeline/auto-generate', status: 500, smoke: true, attempt: 2 },
  }),
});

const dedupeJson = await dedupeRes.json();
assert('Status 200', dedupeRes.status === 200);
assert('ok: true', dedupeJson.ok === true);

// ── Step 3: Run triage ──────────────────────────────────────────────────────
console.log('\n3) POST /api/flashflow/issues/triage/run');

const triageRes = await fetch(`${BASE}/api/flashflow/issues/triage/run`, {
  method: 'POST',
  headers,
});

const triageJson = await triageRes.json();
assert('Status 200', triageRes.status === 200, `got ${triageRes.status}`);
assert('ok: true', triageJson.ok === true, JSON.stringify(triageJson));
assert('triaged >= 1', (triageJson.triaged ?? 0) >= 1, `triaged: ${triageJson.triaged}`);

if (triageJson.results?.length > 0) {
  const r = triageJson.results[0];
  console.log(`   severity: ${r.severity}, subsystem: ${r.subsystem}`);
}

// ── Step 4: Auth guard — should 401 without secret ──────────────────────────
console.log('\n4) Auth guard (no secret)');

const noAuthRes = await fetch(`${BASE}/api/flashflow/issues/intake`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: 'api', message_text: 'should fail' }),
});

assert('Status 401', noAuthRes.status === 401);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
