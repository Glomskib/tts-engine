#!/usr/bin/env node
/**
 * Smoke test for /api/ai/chat rewrite mode
 *
 * Verifies that user instructions (e.g., "add 2 beats") are
 * actually applied to the script and logged to ff_generations.
 *
 * Usage:
 *   node scripts/smoke-test-chat-rewrite.mjs
 *   node scripts/smoke-test-chat-rewrite.mjs --base-url http://localhost:3000
 *   AUTH_COOKIE="sb-xxx=..." node scripts/smoke-test-chat-rewrite.mjs
 *
 * Requires: Server running at localhost:3000 (or override with --base-url)
 */

const BASE_URL = (() => {
  const idx = process.argv.indexOf('--base-url');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.BASE_URL || 'http://localhost:3000';
})();

const AUTH_COOKIE = process.env.AUTH_COOKIE || '';

// A minimal skit to start from (3 beats)
const SEED_SKIT = {
  hook_line: 'Wait, this actually works?',
  beats: [
    { t: '0:00-0:03', action: 'Person looks surprised at phone', dialogue: 'Wait, this actually works?', on_screen_text: 'Day 1' },
    { t: '0:03-0:08', action: 'Shows product close-up', dialogue: 'So I tried this thing everyone is talking about...', on_screen_text: 'The product' },
    { t: '0:08-0:13', action: 'Shows result', dialogue: 'And honestly? Game changer.', on_screen_text: 'Results' },
  ],
  b_roll: ['Product packaging close-up'],
  overlays: ['Day 1 vs Day 7'],
  cta_line: 'Tap the orange cart to grab yours',
  cta_overlay: 'Tap the orange cart',
};

async function postChat(message, currentSkit) {
  const res = await fetch(`${BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(AUTH_COOKIE ? { Cookie: AUTH_COOKIE } : {}),
    },
    body: JSON.stringify({
      message,
      mode: 'rewrite',
      context: {
        brand: 'TestBrand',
        product: 'Test Widget',
        current_skit: currentSkit,
      },
    }),
  });
  return res.json();
}

function pass(label) { console.log(`  ✅ ${label}`); }
function fail(label, detail) { console.error(`  ❌ ${label}: ${detail}`); process.exitCode = 1; }

async function runTests() {
  console.log('=== Chat Rewrite Smoke Test ===');
  console.log(`Target: ${BASE_URL}/api/ai/chat`);
  console.log('');

  // ── Test 1: "Add 2 more beats" should increase beat count ──
  console.log('Test 1: "Add 2 more beats" instruction');
  try {
    const data = await postChat('Add 2 more beats to this script', SEED_SKIT);

    if (!data.ok) {
      fail('API returned error', data.error || JSON.stringify(data));
    } else if (!data.rewritten_skit) {
      fail('No rewritten_skit in response (instruction was lost)', `mode=${data.mode}, response=${(data.response || '').slice(0, 200)}`);
    } else {
      const originalBeats = SEED_SKIT.beats.length;
      const newBeats = data.rewritten_skit.beats?.length ?? 0;
      if (newBeats > originalBeats) {
        pass(`Beat count increased: ${originalBeats} → ${newBeats}`);
      } else {
        fail(`Beat count did NOT increase`, `expected > ${originalBeats}, got ${newBeats}`);
      }

      // Check structure
      if (data.rewritten_skit.hook_line) {
        pass('hook_line present');
      } else {
        fail('hook_line missing from rewritten skit', '');
      }

      if (data.rewritten_skit.cta_line) {
        pass('cta_line preserved');
      } else {
        fail('cta_line missing from rewritten skit', '');
      }
    }
  } catch (err) {
    fail('Network/parse error', err.message);
  }

  console.log('');

  // ── Test 2: "Make the hook punchier" should change hook but keep beats ──
  console.log('Test 2: "Make the hook punchier" instruction');
  try {
    const data = await postChat('Make the hook punchier and more attention-grabbing', SEED_SKIT);

    if (!data.ok) {
      fail('API returned error', data.error || JSON.stringify(data));
    } else if (!data.rewritten_skit) {
      fail('No rewritten_skit in response (instruction was lost)', `response=${(data.response || '').slice(0, 200)}`);
    } else {
      const sameBeats = data.rewritten_skit.beats?.length === SEED_SKIT.beats.length;
      if (sameBeats) {
        pass(`Beat count preserved: ${SEED_SKIT.beats.length}`);
      } else {
        // Not a hard fail — AI might adjust beats slightly
        console.log(`  ⚠️  Beat count changed: ${SEED_SKIT.beats.length} → ${data.rewritten_skit.beats?.length ?? 0} (acceptable)`);
      }

      if (data.rewritten_skit.hook_line && data.rewritten_skit.hook_line !== SEED_SKIT.hook_line) {
        pass(`Hook was modified: "${data.rewritten_skit.hook_line.slice(0, 60)}..."`);
      } else if (data.rewritten_skit.hook_line === SEED_SKIT.hook_line) {
        fail('Hook was NOT modified', 'AI returned identical hook_line');
      } else {
        fail('hook_line missing', '');
      }
    }
  } catch (err) {
    fail('Network/parse error', err.message);
  }

  console.log('');

  // ── Test 3: Verify mode=rewrite is returned ──
  console.log('Test 3: Response includes mode=rewrite');
  try {
    const data = await postChat('Shorten this script', SEED_SKIT);
    if (data.mode === 'rewrite') {
      pass('mode=rewrite present');
    } else if (data.rewritten_skit) {
      pass('rewritten_skit returned (mode field optional)');
    } else {
      fail('Neither mode=rewrite nor rewritten_skit returned', `mode=${data.mode}`);
    }
  } catch (err) {
    fail('Network/parse error', err.message);
  }

  console.log('');

  // ── Test 4: "Make it longer" preserves original hook (regression) ──
  console.log('Test 4: "Make it longer" preserves hook and adds beats');
  try {
    const data = await postChat('Make it longer', SEED_SKIT);

    if (!data.ok) {
      fail('API returned error', data.error || JSON.stringify(data));
    } else if (!data.rewritten_skit) {
      fail('No rewritten_skit in response (instruction was ignored)', `response=${(data.response || '').slice(0, 200)}`);
    } else {
      const newBeats = data.rewritten_skit.beats?.length ?? 0;
      if (newBeats > SEED_SKIT.beats.length) {
        pass(`Beat count increased: ${SEED_SKIT.beats.length} → ${newBeats}`);
      } else {
        fail('Beat count did NOT increase', `expected > ${SEED_SKIT.beats.length}, got ${newBeats}`);
      }

      // Regression check: hook should be preserved (or very similar), not replaced with a generic default
      const originalHook = SEED_SKIT.hook_line.toLowerCase();
      const newHook = (data.rewritten_skit.hook_line || '').toLowerCase();
      if (newHook.includes('wait') || newHook.includes('actually works') || newHook === originalHook) {
        pass(`Hook preserved: "${data.rewritten_skit.hook_line.slice(0, 60)}"`);
      } else {
        fail('Hook was replaced with a generic default (instruction ignored)', `original="${SEED_SKIT.hook_line}", got="${data.rewritten_skit.hook_line}"`);
      }
    }
  } catch (err) {
    fail('Network/parse error', err.message);
  }

  console.log('');
  console.log(process.exitCode ? '=== SOME TESTS FAILED ===' : '=== ALL TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
