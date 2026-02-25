#!/usr/bin/env npx tsx
/**
 * contract-check.ts — Integration contract verification
 *
 * Checks:
 *   1. Required env vars exist (prints present/missing — NEVER prints values)
 *   2. Pings key endpoints and verifies expected HTTP status
 *   3. Probes critical Supabase tables
 *
 * Usage:
 *   npx tsx scripts/contract-check.ts
 *
 * Exit code 0 = launch-ready, 1 = issues detected.
 */

export {};  // Make this file a module to avoid TS global scope collisions

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let warned = 0;

function pass(label: string, detail?: string) {
  passed++;
  console.log(`  \u2713 ${label}${detail ? ` \u2014 ${detail}` : ''}`);
}

function fail(label: string, detail?: string) {
  failed++;
  console.error(`  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ''}`);
}

function warn(label: string, detail?: string) {
  warned++;
  console.log(`  \u26A0 ${label}${detail ? ` \u2014 ${detail}` : ''}`);
}

function has(key: string): boolean {
  return !!process.env[key]?.trim();
}

async function ping(
  url: string,
  opts: {
    headers?: Record<string, string>;
    method?: string;
    expectStatus?: number | number[];
    timeoutMs?: number;
  } = {},
): Promise<{ ok: boolean; status: number; error?: string }> {
  const expected = Array.isArray(opts.expectStatus)
    ? opts.expectStatus
    : [opts.expectStatus ?? 200];
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
    return { ok: expected.includes(res.status), status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── 1. Environment Variables ─────────────────────────────────────────────────

interface EnvGroup {
  name: string;
  vars: { key: string; required: boolean }[];
}

const ENV_GROUPS: EnvGroup[] = [
  {
    name: 'Supabase',
    vars: [
      { key: 'NEXT_PUBLIC_SUPABASE_URL', required: true },
      { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true },
      { key: 'SUPABASE_SERVICE_ROLE_KEY', required: true },
    ],
  },
  {
    name: 'AI Services',
    vars: [
      { key: 'ANTHROPIC_API_KEY', required: true },
      { key: 'REPLICATE_API_TOKEN', required: true },
      { key: 'HEYGEN_API_KEY', required: true },
      { key: 'OPENAI_API_KEY', required: false },
      { key: 'ELEVENLABS_API_KEY', required: false },
    ],
  },
  {
    name: 'Stripe (core)',
    vars: [
      { key: 'STRIPE_SECRET_KEY', required: true },
      { key: 'STRIPE_WEBHOOK_SECRET', required: true },
    ],
  },
  {
    name: 'Stripe (SaaS plan prices)',
    vars: [
      { key: 'STRIPE_PRICE_CREATOR_LITE', required: true },
      { key: 'STRIPE_PRICE_CREATOR_PRO', required: true },
      { key: 'STRIPE_PRICE_BUSINESS', required: true },
    ],
  },
  {
    name: 'Stripe (video plan prices)',
    vars: [
      { key: 'STRIPE_PRICE_VIDEO_STARTER', required: true },
      { key: 'STRIPE_PRICE_VIDEO_GROWTH', required: true },
      { key: 'STRIPE_PRICE_VIDEO_SCALE', required: true },
      { key: 'STRIPE_PRICE_VIDEO_AGENCY', required: true },
    ],
  },
  {
    name: 'Stripe (editing add-ons)',
    vars: [
      { key: 'STRIPE_PRICE_EDITING_ONLY', required: false },
      { key: 'STRIPE_PRICE_EDITING_ADDON', required: false },
      { key: 'STRIPE_PRICE_PER_VIDEO', required: false },
    ],
  },
  {
    name: 'Telegram',
    vars: [
      { key: 'TELEGRAM_BOT_TOKEN', required: true },
      { key: 'TELEGRAM_CHAT_ID', required: true },
      { key: 'TELEGRAM_LOG_CHAT_ID', required: false },
    ],
  },
  {
    name: 'Mission Control',
    vars: [
      { key: 'MISSION_CONTROL_TOKEN', required: true },
      { key: 'MISSION_CONTROL_AGENT_TOKEN', required: false },
    ],
  },
  {
    name: 'Application',
    vars: [
      { key: 'NEXT_PUBLIC_APP_URL', required: true },
      { key: 'ADMIN_USERS', required: true },
      { key: 'ADMIN_UI_ENABLED', required: true },
      { key: 'INTERNAL_SERVICE_TOKEN', required: true },
      { key: 'CRON_SECRET', required: true },
    ],
  },
  {
    name: 'Email (optional)',
    vars: [
      { key: 'SENDGRID_API_KEY', required: false },
      { key: 'EMAIL_FROM', required: false },
    ],
  },
  {
    name: 'Slack (optional)',
    vars: [
      { key: 'SLACK_WEBHOOK_URL', required: false },
    ],
  },
];

function checkEnvVars() {
  console.log('\n[1/3] Environment Variables\n');

  for (const group of ENV_GROUPS) {
    console.log(`  --- ${group.name} ---`);
    for (const v of group.vars) {
      if (has(v.key)) {
        pass(v.key, 'present');
      } else if (v.required) {
        fail(v.key, 'MISSING (required)');
      } else {
        warn(v.key, 'not set (optional)');
      }
    }
    console.log('');
  }
}

// ── 2. Endpoint Pings ────────────────────────────────────────────────────────

async function checkEndpoints() {
  console.log('[2/3] Endpoint Pings\n');

  // Supabase REST — unauthenticated request should return 401 or a table list
  if (has('NEXT_PUBLIC_SUPABASE_URL') && has('NEXT_PUBLIC_SUPABASE_ANON_KEY')) {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
    const result = await ping(url, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      expectStatus: [200, 401, 406],
    });
    if (result.ok) {
      pass('Supabase REST', `HTTP ${result.status}`);
    } else {
      fail('Supabase REST', result.error ?? `HTTP ${result.status}`);
    }
  } else {
    fail('Supabase REST', 'skipped (missing URL or anon key)');
  }

  // Stripe — GET /v1/balance (authed, should return 200)
  if (has('STRIPE_SECRET_KEY')) {
    const result = await ping('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      expectStatus: 200,
    });
    if (result.ok) {
      pass('Stripe API', `HTTP ${result.status}`);
    } else {
      fail('Stripe API', result.error ?? `HTTP ${result.status} (check STRIPE_SECRET_KEY)`);
    }
  } else {
    fail('Stripe API', 'skipped (missing STRIPE_SECRET_KEY)');
  }

  // Anthropic — GET /v1/models (authed, should return 200)
  if (has('ANTHROPIC_API_KEY')) {
    const result = await ping('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      expectStatus: 200,
    });
    if (result.ok) {
      pass('Anthropic API', `HTTP ${result.status}`);
    } else {
      fail('Anthropic API', result.error ?? `HTTP ${result.status} (check ANTHROPIC_API_KEY)`);
    }
  } else {
    fail('Anthropic API', 'skipped (missing ANTHROPIC_API_KEY)');
  }

  // HeyGen — GET /v1/video_status.get (without video_id returns 400, but 401 means bad key)
  if (has('HEYGEN_API_KEY')) {
    const result = await ping('https://api.heygen.com/v2/user/remaining_quota', {
      headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY! },
      expectStatus: [200],
    });
    if (result.ok) {
      pass('HeyGen API', `HTTP ${result.status}`);
    } else if (result.status === 401) {
      fail('HeyGen API', 'HTTP 401 (invalid HEYGEN_API_KEY)');
    } else {
      // Non-200 but not 401 — key might be valid, endpoint may differ
      warn('HeyGen API', result.error ?? `HTTP ${result.status} (key may be valid, endpoint returned unexpected status)`);
    }
  } else {
    fail('HeyGen API', 'skipped (missing HEYGEN_API_KEY)');
  }

  // Replicate — GET /v1/models (authed)
  if (has('REPLICATE_API_TOKEN')) {
    const result = await ping('https://api.replicate.com/v1/models', {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
      expectStatus: 200,
    });
    if (result.ok) {
      pass('Replicate API', `HTTP ${result.status}`);
    } else {
      fail('Replicate API', result.error ?? `HTTP ${result.status} (check REPLICATE_API_TOKEN)`);
    }
  } else {
    fail('Replicate API', 'skipped (missing REPLICATE_API_TOKEN)');
  }

  // Telegram — GET /bot<token>/getMe (should return 200 with bot info)
  if (has('TELEGRAM_BOT_TOKEN')) {
    const result = await ping(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`,
      { expectStatus: 200 },
    );
    if (result.ok) {
      pass('Telegram Bot', `HTTP ${result.status}`);
    } else {
      fail('Telegram Bot', result.error ?? `HTTP ${result.status} (check TELEGRAM_BOT_TOKEN)`);
    }
  } else {
    fail('Telegram Bot', 'skipped (missing TELEGRAM_BOT_TOKEN)');
  }

  // Mission Control — POST /api/auth-check
  if (has('MISSION_CONTROL_TOKEN')) {
    const mcBase = process.env.MC_BASE_URL || 'https://mc.flashflowai.com';
    const token = process.env.MISSION_CONTROL_TOKEN!;
    const result = await ping(`${mcBase}/api/auth-check`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-service-token': token,
        'Content-Type': 'application/json',
      },
      expectStatus: 200,
    });
    if (result.ok) {
      pass('Mission Control', `HTTP ${result.status}`);
    } else if (result.status === 401) {
      fail('Mission Control', 'HTTP 401 (token drift — MISSION_CONTROL_TOKEN mismatch between services)');
    } else {
      fail('Mission Control', result.error ?? `HTTP ${result.status}`);
    }
  } else {
    fail('Mission Control', 'skipped (missing MISSION_CONTROL_TOKEN)');
  }

  // App URL — if set, check that the landing page responds
  if (has('NEXT_PUBLIC_APP_URL')) {
    const result = await ping(process.env.NEXT_PUBLIC_APP_URL!, {
      expectStatus: [200, 301, 302, 308],
      timeoutMs: 10000,
    });
    if (result.ok) {
      pass('App URL', `HTTP ${result.status}`);
    } else {
      warn('App URL', result.error ?? `HTTP ${result.status} (may not be deployed yet)`);
    }
  } else {
    warn('App URL', 'NEXT_PUBLIC_APP_URL not set — skipping');
  }

  console.log('');
}

// ── 3. Supabase Table Probe ──────────────────────────────────────────────────

async function checkTables() {
  console.log('[3/3] Supabase Table Probe\n');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    fail('Table probe', 'skipped (missing Supabase credentials)');
    console.log('');
    return;
  }

  const criticalTables = [
    // Core
    'products',
    'videos',
    'concepts',
    'saved_skits',
    // Audience
    'audience_personas',
    'pain_points',
    // Hooks
    'proven_hooks',
    'hook_suggestions',
    'script_library',
    'reference_videos',
    // Billing
    'subscription_plans',
    'user_subscriptions',
    'user_credits',
    'credit_transactions',
    // Workflow
    'video_events',
    'notifications',
    'audit_log',
    'user_roles',
    'user_profiles',
    // Marketplace
    'edit_jobs',
    'mp_scripts',
    'clients',
    'client_plans',
    'va_profiles',
  ];

  for (const table of criticalTables) {
    // SELECT * LIMIT 0 — checks table existence without reading data
    const result = await ping(`${url}/rest/v1/${table}?select=*&limit=0`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
      },
      expectStatus: [200, 206],
    });
    if (result.ok) {
      pass(table);
    } else if (result.status === 404) {
      fail(table, 'table not found (migration missing)');
    } else {
      fail(table, result.error ?? `HTTP ${result.status}`);
    }
  }

  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('\u2550'.repeat(50));
  console.log('  FlashFlow Contract Check');
  console.log('\u2550'.repeat(50));

  checkEnvVars();
  await checkEndpoints();
  await checkTables();

  console.log('\u2550'.repeat(50));
  const ready = failed === 0;
  console.log(`  ${ready ? '\u2705 LAUNCH-READY' : '\u274C NOT READY'}`);
  console.log(`  ${passed} passed, ${failed} failed, ${warned} warnings`);
  console.log('\u2550'.repeat(50));
  console.log('');

  process.exit(ready ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
