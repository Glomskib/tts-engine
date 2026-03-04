#!/usr/bin/env tsx
/**
 * Smoke test for scripts/setup/audit-env.ts
 *
 * Creates a temporary fake code file referencing FAKE_TEST_VAR,
 * runs the audit scanner logic, and verifies it's detected as missing.
 *
 * Usage:
 *   npx tsx scripts/setup/smoke-test-env-audit.ts
 */

import { writeFileSync, unlinkSync, readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, extname } from 'path';

const ROOT = resolve(process.cwd());
const FAKE_FILE = join(ROOT, '__smoke_test_env_audit_temp.ts');
const ENV_EXAMPLE_PATH = join(ROOT, '.env.example');

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ── Setup ──────────────────────────────────────────────────────────

console.log('Setting up smoke test...\n');

// Create a fake code file with known env var references.
// Build var names via concatenation so the audit scanner doesn't match
// these string literals inside the smoke test itself.
const PREFIX = 'FAKE_TEST_VAR_';
const A = PREFIX + 'AAAA';
const B = PREFIX + 'BBBB';
const C = PREFIX + 'CCCC';
const D = PREFIX + 'DDDD';

writeFileSync(FAKE_FILE, [
  '// Smoke test file — will be deleted after test',
  `const a = process.env.${A};`,
  `const b = process.env.${B};`,
  `const c = process.env['${C}'];`,
  `const d = process.env["${D}"];`,
  '',
].join('\n'));

// ── Inline scanner (mirrors audit-env.ts logic) ───────────────────

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', '.git', '.vercel',
  'coverage', '.turbo', '.claude',
]);
const PLATFORM_VARS = new Set([
  'NODE_ENV', 'VERCEL_URL', 'VERCEL', 'VERCEL_ENV', 'VERCEL_REGION',
  'VERCEL_GIT_COMMIT_SHA', 'VERCEL_GIT_COMMIT_REF', 'CI', 'HOME',
  'PATH', 'NEXT_RUNTIME', 'PORT', 'HOSTNAME', 'TZ',
  '__NEXT_PRIVATE_PREBUNDLED_REACT',
]);

const PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*'([A-Z][A-Z0-9_]*)'\s*\]/g,
  /process\.env\[\s*"([A-Z][A-Z0-9_]*)"\s*\]/g,
];

function scanFileContent(content: string): Set<string> {
  const vars = new Set<string>();
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const varName = match[1];
      if (!PLATFORM_VARS.has(varName)) {
        vars.add(varName);
      }
    }
  }
  return vars;
}

function parseEnvExample(path: string): Set<string> {
  const content = readFileSync(path, 'utf-8');
  const vars = new Set<string>();
  const pattern = /^#?\s*([A-Z][A-Z0-9_]*)=/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    vars.add(match[1]);
  }
  return vars;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0),
      );
    }
  }
  return dp[m][n];
}

// ── Tests ──────────────────────────────────────────────────────────

try {
  console.log('Test 1: Pattern detection');

  const fakeContent = readFileSync(FAKE_FILE, 'utf-8');
  const detected = scanFileContent(fakeContent);

  assert('Detects dot notation (AAAA)', detected.has(A));
  assert('Detects dot notation (BBBB)', detected.has(B));
  assert('Detects single-quote bracket (CCCC)', detected.has(C));
  assert('Detects double-quote bracket (DDDD)', detected.has(D));
  assert('All 4 fake vars detected', detected.size === 4);

  console.log('\nTest 2: Missing detection');

  const exampleVars = parseEnvExample(ENV_EXAMPLE_PATH);

  assert('.env.example does not contain AAAA', !exampleVars.has(A));
  assert('.env.example does not contain BBBB', !exampleVars.has(B));
  assert('.env.example does not contain CCCC', !exampleVars.has(C));
  assert('.env.example does not contain DDDD', !exampleVars.has(D));

  // Confirm these would be reported as missing
  const missing = [...detected].filter(v => !exampleVars.has(v));
  assert('All 4 fake vars reported as missing_in_example', missing.length === 4);

  console.log('\nTest 3: Platform vars excluded');

  const platformContent = 'const x = process.env.NODE_ENV; const y = process.env.VERCEL_URL;';
  const platformDetected = scanFileContent(platformContent);
  assert('NODE_ENV is excluded (platform var)', !platformDetected.has('NODE_ENV'));
  assert('VERCEL_URL is excluded (platform var)', !platformDetected.has('VERCEL_URL'));

  console.log('\nTest 4: Suspicious/typo detection (Levenshtein ≤ 2)');

  assert('STRIPE_SECRT vs STRIPE_SECRET → distance 1', levenshtein('STRIPE_SECRT', 'STRIPE_SECRET') <= 2);
  assert('OPENAI_API_KY vs OPENAI_API_KEY → distance 1', levenshtein('OPENAI_API_KY', 'OPENAI_API_KEY') <= 2);
  assert('FOO vs BAR → distance 3 (not suspicious)', levenshtein('FOO', 'BAR') > 2);
  assert('COMPLETELY_DIFFERENT vs SHORT → not suspicious', levenshtein('COMPLETELY_DIFFERENT', 'SHORT') > 2);

  console.log('\nTest 5: .env.example parser');

  assert('.env.example has NEXT_PUBLIC_SUPABASE_URL', exampleVars.has('NEXT_PUBLIC_SUPABASE_URL'));
  assert('.env.example has ANTHROPIC_API_KEY', exampleVars.has('ANTHROPIC_API_KEY'));
  assert('.env.example has STRIPE_SECRET_KEY (commented)', exampleVars.has('STRIPE_SECRET_KEY'));

  console.log('\nTest 6: Performance');

  const startTime = performance.now();
  let fileCount = 0;
  function countFiles(dir: string) {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let s: ReturnType<typeof statSync>;
      try { s = statSync(full); } catch { continue; }
      if (s.isDirectory()) countFiles(full);
      else if (SCAN_EXTENSIONS.has(extname(entry))) fileCount++;
    }
  }
  countFiles(ROOT);
  const elapsed = performance.now() - startTime;
  assert(`File enumeration < 5000ms (was ${elapsed.toFixed(0)}ms, ${fileCount} files)`, elapsed < 5000);

} finally {
  // ── Cleanup ──────────────────────────────────────────────────────
  try { unlinkSync(FAKE_FILE); } catch { /* ignore */ }
}

// ── Results ────────────────────────────────────────────────────────

console.log(`\n--- SMOKE TEST RESULTS ---`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
console.log(`  total:  ${passed + failed}`);

if (failed > 0) {
  console.error(`\nFAIL: ${failed} assertion(s) failed.`);
  process.exit(1);
}

console.log('\nAll smoke tests passed.');
process.exit(0);
