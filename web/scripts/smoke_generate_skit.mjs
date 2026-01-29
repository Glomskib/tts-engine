#!/usr/bin/env node
/**
 * Smoke test for /api/ai/generate-skit
 *
 * Usage:
 *   node scripts/smoke_generate_skit.mjs
 *   node scripts/smoke_generate_skit.mjs --debug
 *   node scripts/smoke_generate_skit.mjs --product-id <uuid>
 *
 * Requires: Server running at http://localhost:3000
 *           Valid auth cookie (or disable auth for testing)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DEBUG = process.argv.includes('--debug');

// Parse --product-id argument
let productId = null;
const pidIdx = process.argv.indexOf('--product-id');
if (pidIdx !== -1 && process.argv[pidIdx + 1]) {
  productId = process.argv[pidIdx + 1];
}

async function runSmokeTest() {
  console.log('=== Skit Generator Smoke Test ===');
  console.log(`Target: ${BASE_URL}/api/ai/generate-skit${DEBUG ? '?debug=1' : ''}`);
  console.log('');

  // Build payload - use manual product_name mode by default
  const payload = productId
    ? {
        product_id: productId,
        risk_tier: 'SAFE',
        persona: 'NONE',
        intensity: 30,
      }
    : {
        product_name: 'Test Vitamin Supplement',
        brand_name: 'TestBrand',
        risk_tier: 'SAFE',
        persona: 'NONE',
        intensity: 30,
      };

  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('');

  try {
    const url = `${BASE_URL}/api/ai/generate-skit${DEBUG ? '?debug=1' : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: In production this would need auth cookies
      },
      body: JSON.stringify(payload),
    });

    const correlationId = res.headers.get('x-correlation-id');
    const data = await res.json();

    console.log(`HTTP Status: ${res.status}`);
    console.log(`x-correlation-id: ${correlationId || 'not set'}`);
    console.log('');

    if (data.ok) {
      console.log('Result: SUCCESS');
      console.log(`correlation_id: ${data.correlation_id}`);
      console.log(`risk_tier_applied: ${data.data?.risk_tier_applied}`);
      console.log(`risk_score: ${data.data?.risk_score}`);
      console.log(`intensity_applied: ${data.data?.intensity_applied}`);
      console.log(`hook_line: "${data.data?.skit?.hook_line?.slice(0, 60)}..."`);
      console.log(`beats_count: ${data.data?.skit?.beats?.length}`);

      if (DEBUG && data.data?.budget_diagnostics) {
        console.log('');
        console.log('Budget diagnostics:', JSON.stringify(data.data.budget_diagnostics, null, 2));
      }
    } else {
      console.log('Result: ERROR');
      console.log(`error_code: ${data.error_code}`);
      console.log(`message: ${data.message}`);
      console.log(`correlation_id: ${data.correlation_id}`);

      if (data.details) {
        console.log('details:', JSON.stringify(data.details, null, 2));
      }
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
    console.log('');
    console.log('Make sure the server is running: npm run dev');
  }
}

runSmokeTest();
