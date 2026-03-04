#!/usr/bin/env tsx
/**
 * Deterministic environment variable audit system.
 *
 * Scans the codebase for env var references, compares with .env.example,
 * and reports drift. CI-ready: exits 1 when vars are missing from .env.example.
 *
 * Usage:
 *   npx tsx scripts/setup/audit-env.ts              # audit (exit 1 if missing)
 *   npx tsx scripts/setup/audit-env.ts --write-example  # patch .env.example then exit 0
 *
 * Scans: .ts, .tsx, .js, .mjs files
 * Skips: node_modules, .next, dist, .git, .vercel, coverage, .turbo
 * Runtime: < 5 seconds on typical codebase
 */

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'fs';
import { resolve, join, extname } from 'path';

// ── Config ─────────────────────────────────────────────────────────

const ROOT = resolve(process.cwd());
const ENV_EXAMPLE_PATH = join(ROOT, '.env.example');
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', '.git', '.vercel',
  'coverage', '.turbo', '.claude',
]);

// Well-known env vars set by platform / runtime (not user-configured)
const PLATFORM_VARS = new Set([
  'NODE_ENV', 'VERCEL_URL', 'VERCEL', 'VERCEL_ENV', 'VERCEL_REGION',
  'VERCEL_GIT_COMMIT_SHA', 'VERCEL_GIT_COMMIT_REF', 'CI', 'HOME',
  'PATH', 'NEXT_RUNTIME', 'PORT', 'HOSTNAME', 'TZ',
  '__NEXT_PRIVATE_PREBUNDLED_REACT',
]);

// ── Flags ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const writeExample = args.includes('--write-example');

// ── Types ──────────────────────────────────────────────────────────

interface AuditResult {
  missing_in_example: string[];
  unused_in_code: string[];
  suspicious_similar: Array<{ from: string; maybe: string }>;
}

// ── 1. Scan codebase ───────────────────────────────────────────────

const startTime = performance.now();

const codeVars = new Map<string, string[]>(); // varName → [file1, file2, ...]

// Matches direct property access and bracket notation with string literals
const PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*'([A-Z][A-Z0-9_]*)'\s*\]/g,
  /process\.env\[\s*"([A-Z][A-Z0-9_]*)"\s*\]/g,
];

function scanDir(dir: string) {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let s: ReturnType<typeof statSync>;
    try { s = statSync(full); } catch { continue; }

    if (s.isDirectory()) {
      scanDir(full);
    } else if (SCAN_EXTENSIONS.has(extname(entry))) {
      scanFile(full);
    }
  }
}

function scanFile(filePath: string) {
  let content: string;
  try { content = readFileSync(filePath, 'utf-8'); } catch { return; }

  const relative = filePath.replace(ROOT + '/', '');

  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const varName = match[1];
      if (PLATFORM_VARS.has(varName)) continue;

      const existing = codeVars.get(varName) || [];
      if (!existing.includes(relative)) {
        existing.push(relative);
      }
      codeVars.set(varName, existing);
    }
  }
}

console.log('Scanning codebase...');
scanDir(ROOT);
console.log(`Found ${codeVars.size} unique env vars in code.`);

// ── 2. Parse .env.example ──────────────────────────────────────────

if (!existsSync(ENV_EXAMPLE_PATH)) {
  console.error(`ERROR: .env.example not found at ${ENV_EXAMPLE_PATH}`);
  process.exit(1);
}

const exampleContent = readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
const exampleVars = new Set<string>();
const EXAMPLE_PATTERN = /^#?\s*([A-Z][A-Z0-9_]*)=/gm;

let exMatch: RegExpExecArray | null;
while ((exMatch = EXAMPLE_PATTERN.exec(exampleContent)) !== null) {
  exampleVars.add(exMatch[1]);
}
console.log(`Found ${exampleVars.size} vars in .env.example.\n`);

// ── 3. Compute diffs ───────────────────────────────────────────────

const missingInExample: string[] = [];
const unusedInCode: string[] = [];

for (const varName of [...codeVars.keys()].sort()) {
  if (!exampleVars.has(varName)) {
    missingInExample.push(varName);
  }
}

for (const varName of [...exampleVars].sort()) {
  if (!codeVars.has(varName)) {
    unusedInCode.push(varName);
  }
}

// ── 4. Suspicious (typo detection via Levenshtein ≤ 2) ─────────────

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

const suspiciousSimilar: Array<{ from: string; maybe: string }> = [];
for (const cv of missingInExample) {
  for (const ev of unusedInCode) {
    const dist = levenshtein(cv, ev);
    if (dist > 0 && dist <= 2) {
      suspiciousSimilar.push({ from: cv, maybe: ev });
    }
  }
}

// ── 5. Structured output ───────────────────────────────────────────

const result: AuditResult = {
  missing_in_example: missingInExample,
  unused_in_code: unusedInCode,
  suspicious_similar: suspiciousSimilar,
};

// ── 6. Report ──────────────────────────────────────────────────────

console.log('=== ENV VAR AUDIT REPORT ===\n');

if (missingInExample.length > 0) {
  console.log(`MISSING in .env.example (${missingInExample.length}):`);
  for (const v of missingInExample) {
    const files = codeVars.get(v) || [];
    console.log(`  - ${v}  (used in: ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` +${files.length - 3} more` : ''})`);
  }
  console.log('');
}

if (unusedInCode.length > 0) {
  console.log(`UNUSED in code (${unusedInCode.length}):`);
  for (const v of unusedInCode) {
    console.log(`  - ${v}`);
  }
  console.log('');
}

if (suspiciousSimilar.length > 0) {
  console.log('WARNING — SUSPICIOUS (possible typos):');
  for (const s of suspiciousSimilar) {
    console.log(`  ? "${s.from}" (code) ~ "${s.maybe}" (.env.example)`);
  }
  console.log('');
}

if (missingInExample.length === 0 && unusedInCode.length === 0) {
  console.log('All clear! Code vars match .env.example.\n');
}

// ── 7. JSON structured output ──────────────────────────────────────

console.log('--- STRUCTURED OUTPUT ---');
console.log(JSON.stringify(result, null, 2));
console.log('');

// ── 8. Summary ─────────────────────────────────────────────────────

const elapsed = (performance.now() - startTime).toFixed(0);

console.log('--- SUMMARY ---');
console.log(`  vars_referenced: ${codeVars.size}`);
console.log(`  vars_defined:    ${exampleVars.size}`);
console.log(`  missing:         ${missingInExample.length}`);
console.log(`  unused:          ${unusedInCode.length}`);
console.log(`  suspicious:      ${suspiciousSimilar.length}`);
console.log(`  runtime:         ${elapsed}ms`);

// ── 9. Patch mode ──────────────────────────────────────────────────

if (writeExample && missingInExample.length > 0) {
  const date = new Date().toISOString().split('T')[0];
  const lines = [
    '',
    `# --- AUTO-ADDED BY env:audit ON ${date} ---`,
  ];
  for (const v of missingInExample) {
    lines.push(`# ${v}=`);
  }
  lines.push('');

  writeFileSync(ENV_EXAMPLE_PATH, exampleContent.trimEnd() + '\n' + lines.join('\n'));
  console.log(`\nPatched .env.example with ${missingInExample.length} new vars (commented).`);
  process.exit(0);
}

// ── 10. Exit codes (CI-ready) ──────────────────────────────────────

if (missingInExample.length > 0) {
  console.log(`\nFAIL: ${missingInExample.length} env vars used in code but missing from .env.example.`);
  console.log('Run "npm run env:audit:fix" to auto-patch .env.example.');
  process.exit(1);
}

// Unused or suspicious vars are warnings only — exit 0
process.exit(0);
