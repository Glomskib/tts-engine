#!/usr/bin/env npx tsx
/**
 * Test: Telegram message sanitizer
 *
 * Validates that code/tool/ANSI content is blocked and clean messages pass through.
 * Run: npx tsx scripts/test-telegram-sanitizer.ts
 */

import { sanitizeTelegramMessage } from '../lib/telegram';

let pass = 0;
let fail = 0;

function assert(label: string, result: string | null, expected: 'blocked' | 'pass') {
  const ok = expected === 'blocked' ? result === null : result !== null;
  if (ok) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label} — expected ${expected}, got: ${result === null ? 'null' : JSON.stringify(result.slice(0, 80))}`);
  }
}

console.log('\n── Telegram Sanitizer Tests ──\n');

// --- Should be BLOCKED ---
console.log('Should BLOCK (code/tool leaks):');

assert('Fenced code block', sanitizeTelegramMessage('Here is the fix:\n```\nconst x = 1;\n```'), 'blocked');
assert('Import statement', sanitizeTelegramMessage('import { foo } from "bar";'), 'blocked');
assert('Python def', sanitizeTelegramMessage('def my_function(x):\n  return x'), 'blocked');
assert('Bare await', sanitizeTelegramMessage('await supabaseAdmin.from("videos").select("*")'), 'blocked');
assert('Session token', sanitizeTelegramMessage('session_abc123def456 active'), 'blocked');
assert('tool_use marker', sanitizeTelegramMessage('Using tool_use to read file'), 'blocked');
assert('JS function decl', sanitizeTelegramMessage('function handleClick(e) { ... }'), 'blocked');
assert('LLM preamble', sanitizeTelegramMessage("Here's the code to fix the bug:"), 'blocked');
assert('command: prefix', sanitizeTelegramMessage('command: git push origin master'), 'blocked');
assert('JSON object', sanitizeTelegramMessage('Result: {"status": "ok", "count": 5}'), 'blocked');
assert('Lone closing brace', sanitizeTelegramMessage('some text\n}\nmore text'), 'blocked');
assert('ANSI escape raw', sanitizeTelegramMessage('Output: \x1b[31mERROR\x1b[0m'), 'blocked');
assert('ANSI escape string', sanitizeTelegramMessage('Output: \\x1b[31mred\\x1b[0m'), 'blocked');
assert('Class declaration', sanitizeTelegramMessage('class MyHandler {\n  handle() {}\n}'), 'blocked');
assert('Const assignment', sanitizeTelegramMessage('const result = await fetch(url)'), 'blocked');
assert('Export statement', sanitizeTelegramMessage('export default function Page()'), 'blocked');
assert('Return statement', sanitizeTelegramMessage('return NextResponse.json({ ok: true })'), 'blocked');
assert('Console call', sanitizeTelegramMessage('console.log("debugging info")'), 'blocked');
assert('Empty message', sanitizeTelegramMessage(''), 'blocked');
assert('Whitespace only', sanitizeTelegramMessage('   \n  \n  '), 'blocked');

// --- Should PASS ---
console.log('\nShould PASS (clean messages):');

assert('Simple notification', sanitizeTelegramMessage('🎬 Video ready for review'), 'pass');
assert('Daily digest header', sanitizeTelegramMessage('<b>📊 Daily Digest — Mon, Feb 24</b>'), 'pass');
assert('Render status', sanitizeTelegramMessage('🎬 Quality Gate: ProductX scored 8/10 — PASS'), 'pass');
assert('Retainer alert', sanitizeTelegramMessage('⏰ BrandX: Only 3 days left! 5 videos to go.'), 'pass');
assert('Auto-post confirm', sanitizeTelegramMessage('📱 Auto-posted to TikTok!\nProduct: TestProd'), 'pass');
assert('Script of day', sanitizeTelegramMessage('📝 Script of the Day\nGenerated for 5 users'), 'pass');
assert('Milestone', sanitizeTelegramMessage('🎉 BrandY: 30 videos complete! $500 retainer earned!'), 'pass');
assert('Behind pace', sanitizeTelegramMessage('⚠️ BrandZ: Falling behind! 10/30 posted (expected 15 by now).'), 'pass');

// --- Line truncation ---
console.log('\nLine truncation:');
const longMsg = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`).join('\n');
const truncated = sanitizeTelegramMessage(longMsg);
const lineCount = truncated?.split('\n').length ?? 0;
assert(`30-line message truncated to ≤26 lines (got ${lineCount})`, truncated, lineCount <= 26 ? 'pass' : 'blocked');

// --- Non-printable stripping ---
console.log('\nNon-printable stripping:');
const withCtrl = 'Hello\x00\x01\x02World';
const stripped = sanitizeTelegramMessage(withCtrl);
assert('Control chars removed', stripped, stripped && !stripped.includes('\x00') ? 'pass' : 'blocked');

console.log(`\n── Results: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail > 0 ? 1 : 0);
