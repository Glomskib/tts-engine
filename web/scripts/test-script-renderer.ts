#!/usr/bin/env npx tsx
/**
 * Deterministic test harness for script-renderer.ts
 * Tests round-trip: ScriptJson -> renderScriptText -> parseScriptText -> ScriptJson
 *
 * Run with: npx tsx scripts/test-script-renderer.ts
 */

import {
  ScriptJson,
  renderScriptText,
  parseScriptText,
  validateScriptJson,
  normalizeScriptJson,
} from '../lib/script-renderer';

interface TestCase {
  name: string;
  input: ScriptJson;
}

interface ValidationTestCase {
  name: string;
  input: unknown;
  strict: boolean;
  expectValid: boolean;
}

// Test cases for round-trip
const roundTripTestCases: TestCase[] = [
  {
    name: 'Simple script with hook, body, cta',
    input: {
      hook: 'Did you know this one trick?',
      body: 'Here is the main content that explains everything you need to know.',
      cta: 'Shop now!',
    },
  },
  {
    name: 'Script with bullets',
    input: {
      hook: 'Top 3 reasons why',
      body: 'Let me explain each one.',
      cta: 'Click the link',
      bullets: ['Reason one is amazing', 'Reason two is even better', 'Reason three seals the deal'],
    },
  },
  {
    name: 'Full script with all fields',
    input: {
      hook: 'Stop scrolling!',
      body: 'This product changed my life. I was struggling before, but now everything is different.',
      cta: 'Get yours today',
      bullets: ['Natural ingredients', 'Fast results', 'Money back guarantee'],
      on_screen_text: ['Limited time offer', '50% off today only'],
      b_roll: ['Product close-up', 'Happy customer testimonial', 'Before and after'],
      pacing: 'fast',
      compliance_notes: 'Avoid medical claims',
      uploader_instructions: 'Post at 6pm EST',
      product_tags: ['supplements', 'wellness', 'daily-vitamins'],
    },
  },
  {
    name: 'Script with custom sections',
    input: {
      hook: 'Wait for it...',
      body: 'The reveal is coming.',
      cta: 'See more',
      sections: [
        { name: 'DISCLAIMER', content: 'Results may vary' },
        { name: 'CREDITS', content: 'Music by Example Artist' },
      ],
    },
  },
  {
    name: 'Empty optional fields',
    input: {
      hook: 'Just the basics',
      body: 'Nothing else needed.',
    },
  },
  {
    name: 'Script with whitespace to trim',
    input: {
      hook: '  Needs trimming  ',
      body: '  Body with spaces  ',
      cta: '  Call to action  ',
      bullets: ['  Bullet 1  ', '', '  Bullet 2  ', '   '],
    },
  },
];

// Test cases for validation
const validationTestCases: ValidationTestCase[] = [
  {
    name: 'Valid script passes validation',
    input: { hook: 'Test', body: 'Content' },
    strict: true,
    expectValid: true,
  },
  {
    name: 'Unknown key fails strict validation',
    input: { hook: 'Test', body: 'Content', unknown_field: 'value' },
    strict: true,
    expectValid: false,
  },
  {
    name: 'Unknown key passes non-strict validation',
    input: { hook: 'Test', body: 'Content', unknown_field: 'value' },
    strict: false,
    expectValid: true,
  },
  {
    name: 'Invalid type fails validation',
    input: { hook: 123, body: 'Content' },
    strict: false,
    expectValid: false,
  },
  {
    name: 'Invalid array item fails validation',
    input: { hook: 'Test', body: 'Content', bullets: ['valid', 123, 'also valid'] },
    strict: false,
    expectValid: false,
  },
];

let passed = 0;
let failed = 0;

console.log('='.repeat(60));
console.log('Script Renderer Test Harness');
console.log('='.repeat(60));
console.log('');

// Round-trip tests
console.log('ROUND-TRIP TESTS');
console.log('-'.repeat(40));

for (const testCase of roundTripTestCases) {
  try {
    // Normalize input first (as would happen in real usage)
    const normalized = normalizeScriptJson(testCase.input);

    // Render to text
    const rendered = renderScriptText(normalized);

    // Parse back
    const parsed = parseScriptText(rendered);

    // Re-render the parsed result
    const reRendered = renderScriptText(parsed);

    // Check if round-trip produces same text
    if (rendered === reRendered) {
      console.log(`PASS: ${testCase.name}`);
      passed++;
    } else {
      console.log(`FAIL: ${testCase.name}`);
      console.log('  Original render:');
      console.log('  ' + rendered.split('\n').slice(0, 3).join('\n  ') + '...');
      console.log('  Re-rendered:');
      console.log('  ' + reRendered.split('\n').slice(0, 3).join('\n  ') + '...');
      failed++;
    }
  } catch (err) {
    console.log(`ERROR: ${testCase.name}`);
    console.log(`  ${(err as Error).message}`);
    failed++;
  }
}

console.log('');

// Validation tests
console.log('VALIDATION TESTS');
console.log('-'.repeat(40));

for (const testCase of validationTestCases) {
  try {
    const result = validateScriptJson(testCase.input, { strict: testCase.strict });

    if (result.valid === testCase.expectValid) {
      console.log(`PASS: ${testCase.name}`);
      passed++;
    } else {
      console.log(`FAIL: ${testCase.name}`);
      console.log(`  Expected valid=${testCase.expectValid}, got valid=${result.valid}`);
      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.join(', ')}`);
      }
      failed++;
    }
  } catch (err) {
    console.log(`ERROR: ${testCase.name}`);
    console.log(`  ${(err as Error).message}`);
    failed++;
  }
}

console.log('');
console.log('='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

// Exit with error code if any tests failed
process.exit(failed > 0 ? 1 : 0);
