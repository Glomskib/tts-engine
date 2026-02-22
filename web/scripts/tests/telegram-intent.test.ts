#!/usr/bin/env npx tsx
/**
 * Unit tests for the Telegram intent classifier.
 *
 * Run:  npx tsx scripts/tests/telegram-intent.test.ts
 *
 * Zero dependencies — uses Node assert.
 */
import { strict as assert } from 'node:assert';
import { classifyIntent, CONFIRMATION_PROMPT } from '../../lib/telegram-intent';

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

console.log('\n=== Telegram Intent Classifier Tests ===\n');

// ── normal: everyday messages should NOT trigger anything ───────────────────
test('normal: "hey what\'s up"', () => {
  assert.equal(classifyIntent("hey what's up", false), 'normal');
});

test('normal: "give me a rundown"', () => {
  assert.equal(classifyIntent('give me a rundown', false), 'normal');
});

test('normal: "good morning"', () => {
  assert.equal(classifyIntent('good morning', false), 'normal');
});

test('normal: "what did you do today"', () => {
  assert.equal(classifyIntent('what did you do today', false), 'normal');
});

test('normal: "show me the latest videos"', () => {
  assert.equal(classifyIntent('show me the latest videos', false), 'normal');
});

test('normal: empty string', () => {
  assert.equal(classifyIntent('', false), 'normal');
});

test('normal: "thanks!"', () => {
  assert.equal(classifyIntent('thanks!', false), 'normal');
});

// ── maybe_issue: keyword matches that need confirmation ────────────────────
test('maybe_issue: "this is broken"', () => {
  assert.equal(classifyIntent('this is broken', false), 'maybe_issue');
});

test('maybe_issue: "video generation failed"', () => {
  assert.equal(classifyIntent('video generation failed', false), 'maybe_issue');
});

test('maybe_issue: "I found a bug in the upload"', () => {
  assert.equal(classifyIntent('I found a bug in the upload', false), 'maybe_issue');
});

test('maybe_issue: "getting an error on the dashboard"', () => {
  assert.equal(classifyIntent('getting an error on the dashboard', false), 'maybe_issue');
});

test('maybe_issue: "the pipeline is down"', () => {
  assert.equal(classifyIntent('the pipeline is down', false), 'maybe_issue');
});

test('maybe_issue: "captions not working"', () => {
  assert.equal(classifyIntent('captions not working', false), 'maybe_issue');
});

test('maybe_issue: "it crashed again"', () => {
  assert.equal(classifyIntent('it crashed again', false), 'maybe_issue');
});

// ── explicit_issue: commands ────────────────────────────────────────────────
test('explicit: "/log captions failing"', () => {
  assert.equal(classifyIntent('/log captions failing', false), 'explicit_issue');
});

test('explicit: "/issue video not rendering"', () => {
  assert.equal(classifyIntent('/issue video not rendering', false), 'explicit_issue');
});

test('explicit: "/bug upload broken"', () => {
  assert.equal(classifyIntent('/bug upload broken', false), 'explicit_issue');
});

test('explicit: "/report slow dashboard"', () => {
  assert.equal(classifyIntent('/report slow dashboard', false), 'explicit_issue');
});

test('explicit: "/log" alone (bare command)', () => {
  assert.equal(classifyIntent('/log', false), 'explicit_issue');
});

// ── explicit_issue: natural language phrases ────────────────────────────────
test('explicit: "log this"', () => {
  assert.equal(classifyIntent('log this', false), 'explicit_issue');
});

test('explicit: "file a bug"', () => {
  assert.equal(classifyIntent('file a bug', false), 'explicit_issue');
});

test('explicit: "report this error"', () => {
  assert.equal(classifyIntent('report this error', false), 'explicit_issue');
});

test('explicit: "triage this"', () => {
  assert.equal(classifyIntent('triage this', false), 'explicit_issue');
});

test('explicit: "save this as an issue"', () => {
  assert.equal(classifyIntent('save this as an issue', false), 'explicit_issue');
});

test('explicit: "file an issue"', () => {
  assert.equal(classifyIntent('file an issue', false), 'explicit_issue');
});

// ── confirm_yes: reply context ──────────────────────────────────────────────
test('confirm_yes: "yes" replying to confirmation prompt', () => {
  assert.equal(classifyIntent('yes', true, CONFIRMATION_PROMPT), 'confirm_yes');
});

test('confirm_yes: "y" replying to confirmation prompt', () => {
  assert.equal(classifyIntent('y', true, CONFIRMATION_PROMPT), 'confirm_yes');
});

test('confirm_yes: "yeah" replying to confirmation prompt', () => {
  assert.equal(classifyIntent('yeah', true, CONFIRMATION_PROMPT), 'confirm_yes');
});

test('confirm_yes: "sure" replying to confirmation prompt', () => {
  assert.equal(classifyIntent('sure', true, CONFIRMATION_PROMPT), 'confirm_yes');
});

test('confirm_yes: "do it" replying to confirmation prompt', () => {
  assert.equal(classifyIntent('do it', true, CONFIRMATION_PROMPT), 'confirm_yes');
});

test('confirm_yes: "log it" replying to confirmation prompt', () => {
  assert.equal(classifyIntent('log it', true, CONFIRMATION_PROMPT), 'confirm_yes');
});

// ── confirm_yes: should NOT fire without the right reply context ────────────
test('normal: "yes" without being a reply', () => {
  assert.equal(classifyIntent('yes', false), 'normal');
});

test('normal: "yes" replying to unrelated message', () => {
  assert.equal(classifyIntent('yes', true, 'Do you want pizza?'), 'normal');
});

test('normal: "no" replying to confirmation prompt', () => {
  // "no" should NOT trigger confirm_yes — it should be normal
  assert.equal(classifyIntent('no', true, CONFIRMATION_PROMPT), 'normal');
});

// ── edge: mixed signals ────────────────────────────────────────────────────
test('explicit wins: "/log this is broken" — command overrides keyword', () => {
  assert.equal(classifyIntent('/log this is broken', false), 'explicit_issue');
});

test('explicit wins: "log this error" — explicit phrase overrides keyword', () => {
  assert.equal(classifyIntent('log this error', false), 'explicit_issue');
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
