#!/usr/bin/env npx tsx
/**
 * Unit tests for the Telegram message sanitizer.
 *
 * Run:  npx tsx scripts/tests/telegram-sanitizer.test.ts
 *
 * Zero dependencies — uses Node assert.
 */
import { strict as assert } from 'node:assert';
import { sanitizeTelegramMessage, MAX_LINES } from '../../lib/telegram';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

console.log('\n=== Telegram Sanitizer Tests ===\n');

// ── MAX_LINES constant ───────────────────────────────────────────────────────
test('MAX_LINES is 5', () => {
  assert.equal(MAX_LINES, 5);
});

// ── Blocks code leaks ────────────────────────────────────────────────────────
test('blocks fenced code blocks (```)', () => {
  assert.equal(sanitizeTelegramMessage('Here is some code:\n```\nconst x = 1;\n```'), null);
});

test('blocks ANSI escape (raw \\x1b)', () => {
  assert.equal(sanitizeTelegramMessage('Output: \x1b[31mred text\x1b[0m'), null);
});

test('blocks ANSI escape (escaped string \\x1b)', () => {
  assert.equal(sanitizeTelegramMessage('Output: \\x1b[31mred'), null);
});

test('blocks ANSI escape (unicode \\u001b)', () => {
  assert.equal(sanitizeTelegramMessage('Output: \u001b[31mred'), null);
});

test('blocks ANSI escape (escaped unicode \\u001b)', () => {
  assert.equal(sanitizeTelegramMessage('Output: \\u001b[31mred'), null);
});

test('blocks import statements', () => {
  assert.equal(sanitizeTelegramMessage('import { foo } from "bar";'), null);
});

test('blocks Python function defs', () => {
  assert.equal(sanitizeTelegramMessage('def hello_world():\n  print("hi")'), null);
});

test('blocks bare await', () => {
  assert.equal(sanitizeTelegramMessage('await fetchData()'), null);
});

test('blocks session tokens', () => {
  assert.equal(sanitizeTelegramMessage('Token: session_abc123defgh'), null);
});

test('blocks tool references', () => {
  assert.equal(sanitizeTelegramMessage('Using the search tool now'), null);
});

test('blocks JS function declarations', () => {
  assert.equal(sanitizeTelegramMessage('function handleClick(e) { }'), null);
});

test('blocks LLM preamble "Here\'s the code"', () => {
  assert.equal(sanitizeTelegramMessage("Here's the code for the feature"), null);
});

test('blocks command: prefix', () => {
  assert.equal(sanitizeTelegramMessage('command: npm install'), null);
});

test('blocks JSON object literals', () => {
  assert.equal(sanitizeTelegramMessage('Response: { "status": 200 }'), null);
});

test('blocks lone closing brace', () => {
  assert.equal(sanitizeTelegramMessage('stuff\n}\nmore'), null);
});

test('blocks class declarations', () => {
  assert.equal(sanitizeTelegramMessage('class VideoProcessor {'), null);
});

test('blocks const assignments', () => {
  assert.equal(sanitizeTelegramMessage('const apiKey = "sk-123"'), null);
});

test('blocks export statements', () => {
  assert.equal(sanitizeTelegramMessage('export default handler'), null);
});

test('blocks return statements', () => {
  assert.equal(sanitizeTelegramMessage('return result'), null);
});

test('blocks console calls', () => {
  assert.equal(sanitizeTelegramMessage('console.log("debug")'), null);
});

test('blocks console.error', () => {
  assert.equal(sanitizeTelegramMessage('console.error("fail")'), null);
});

test('blocks console.warn', () => {
  assert.equal(sanitizeTelegramMessage('console.warn("careful")'), null);
});

// ── Allows clean messages ────────────────────────────────────────────────────
test('allows emoji-prefixed digest line', () => {
  const msg = '📊 Daily Digest — Tue Feb 25';
  assert.equal(sanitizeTelegramMessage(msg), msg);
});

test('allows plain text alert', () => {
  const msg = 'Pipeline healthy, 0 failures';
  assert.equal(sanitizeTelegramMessage(msg), msg);
});

test('allows multi-line summary under limit', () => {
  const msg = 'Line 1\nLine 2\nLine 3';
  assert.equal(sanitizeTelegramMessage(msg), msg);
});

test('allows exactly MAX_LINES lines', () => {
  const lines = Array.from({ length: MAX_LINES }, (_, i) => `Line ${i + 1}`);
  const msg = lines.join('\n');
  assert.equal(sanitizeTelegramMessage(msg), msg);
});

// ── Enforces line limit ──────────────────────────────────────────────────────
test('truncates to MAX_LINES + ellipsis', () => {
  const lines = Array.from({ length: MAX_LINES + 1 }, (_, i) => `Line ${i + 1}`);
  const msg = lines.join('\n');
  const result = sanitizeTelegramMessage(msg);
  assert.ok(result !== null);
  const resultLines = result!.split('\n');
  // Should be MAX_LINES lines + 1 line for "…"
  assert.equal(resultLines.length, MAX_LINES + 1);
  assert.equal(resultLines[MAX_LINES], '…');
});

test('6-line input → truncated to 5 + "…"', () => {
  const msg = 'A\nB\nC\nD\nE\nF';
  const result = sanitizeTelegramMessage(msg);
  assert.ok(result !== null);
  assert.ok(result!.endsWith('\n…'));
  const resultLines = result!.split('\n');
  assert.equal(resultLines.length, 6); // 5 content + "…"
  assert.equal(resultLines[0], 'A');
  assert.equal(resultLines[4], 'E');
  assert.equal(resultLines[5], '…');
});

// ── Edge cases ───────────────────────────────────────────────────────────────
test('null input → null', () => {
  assert.equal(sanitizeTelegramMessage(null as any), null);
});

test('empty string → null', () => {
  assert.equal(sanitizeTelegramMessage(''), null);
});

test('undefined input → null', () => {
  assert.equal(sanitizeTelegramMessage(undefined as any), null);
});

test('whitespace-only → null', () => {
  assert.equal(sanitizeTelegramMessage('   \n  \t  '), null);
});

test('non-printable chars stripped', () => {
  // \x01 (SOH) should be stripped, leaving clean text
  const result = sanitizeTelegramMessage('Hello\x01World');
  assert.equal(result, 'HelloWorld');
});

test('mixed non-printable chars stripped', () => {
  const result = sanitizeTelegramMessage('A\x02B\x03C\x04D');
  assert.equal(result, 'ABCD');
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
