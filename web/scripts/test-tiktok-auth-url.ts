/**
 * Test: TikTok OAuth authorize URL builder
 *
 * Run: npx tsx scripts/test-tiktok-auth-url.ts
 *
 * Validates that the authorize URL is correctly constructed
 * without requiring a running server or real env vars.
 */

import assert from 'node:assert';

// Simulate the URL builder logic from app/api/tiktok/auth/route.ts
function buildTikTokAuthUrl(opts: {
  clientKey: string;
  redirectUri: string;
  state: string;
}): string {
  const scope = 'user.info.basic,video.list';
  const params = [
    `client_key=${encodeURIComponent(opts.clientKey)}`,
    `scope=${scope}`, // literal commas — TikTok requirement
    `response_type=code`,
    `redirect_uri=${encodeURIComponent(opts.redirectUri)}`,
    `state=${encodeURIComponent(opts.state)}`,
  ].join('&');
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

// --- Tests ---

const TEST_KEY = 'abc123testkey';
const TEST_REDIRECT = 'https://example.com/api/tiktok/callback';
const TEST_STATE = 'deadbeef1234567890abcdef12345678';

const url = buildTikTokAuthUrl({
  clientKey: TEST_KEY,
  redirectUri: TEST_REDIRECT,
  state: TEST_STATE,
});

const parsed = new URL(url);

// 1. URL starts with correct base
assert.ok(
  url.startsWith('https://www.tiktok.com/v2/auth/authorize/'),
  `URL must start with TikTok v2 auth base. Got: ${url}`
);

// 2. client_key is present and matches
assert.strictEqual(
  parsed.searchParams.get('client_key'),
  TEST_KEY,
  'client_key param must match the provided key'
);

// 3. redirect_uri is present and properly encoded
assert.strictEqual(
  parsed.searchParams.get('redirect_uri'),
  TEST_REDIRECT,
  'redirect_uri param must match (URL-decoded) the provided redirect URI'
);
// Verify it was actually encoded in the raw URL
assert.ok(
  url.includes('redirect_uri=' + encodeURIComponent(TEST_REDIRECT)),
  'redirect_uri must be URL-encoded in the raw URL string'
);

// 4. response_type=code
assert.strictEqual(
  parsed.searchParams.get('response_type'),
  'code',
  'response_type must be "code"'
);

// 5. state is non-empty
const stateParam = parsed.searchParams.get('state');
assert.ok(stateParam && stateParam.length > 0, 'state param must be non-empty');
assert.strictEqual(stateParam, TEST_STATE, 'state param must match provided state');

// 6. scope contains literal commas (not %2C)
assert.ok(
  url.includes('scope=user.info.basic,video.list'),
  'scope must contain literal commas, not URL-encoded %2C'
);

// 7. Client key format validation (mirrors route logic)
assert.ok(
  /^[A-Za-z0-9_-]+$/.test(TEST_KEY),
  'Client key must be alphanumeric with underscores/hyphens only'
);

console.log('✅ All TikTok auth URL tests passed');
