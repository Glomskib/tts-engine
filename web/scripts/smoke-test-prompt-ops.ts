#!/usr/bin/env npx tsx
/**
 * Smoke test for PromptOps (Phase 3A).
 *
 * Requires a running dev server at localhost:3000 and ADMIN_BEARER_TOKEN env var.
 *
 * Usage:
 *   ADMIN_BEARER_TOKEN=<token> npx tsx scripts/smoke-test-prompt-ops.ts
 */

export {};

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TOKEN = process.env.ADMIN_BEARER_TOKEN;

if (!TOKEN) {
  console.error('ADMIN_BEARER_TOKEN env var is required');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

interface StepResult {
  step: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

const results: StepResult[] = [];

async function run(step: string, fn: () => Promise<unknown>): Promise<unknown> {
  try {
    const data = await fn();
    results.push({ step, ok: true, data });
    console.log(`  PASS  ${step}`);
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ step, ok: false, error: message });
    console.log(`  FAIL  ${step}: ${message}`);
    return null;
  }
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
  return json;
}

async function main() {
  console.log(`\nPromptOps Smoke Test — ${BASE}\n`);

  // Step 1: Create template
  const tmplResult = (await run('1. Create template', () =>
    api('POST', '/api/flashflow/prompts/templates', {
      key: 'smoke_test_template',
      title: 'Smoke Test Template',
      description: 'Created by smoke-test-prompt-ops.ts',
    }),
  )) as { data?: { id: string } } | null;

  const templateId = tmplResult?.data?.id;
  if (!templateId) {
    console.log('\nCannot continue without template. Aborting.\n');
    printSummary();
    return;
  }

  // Step 2: Create version v1
  const v1Result = (await run('2. Create version v1', () =>
    api('POST', '/api/flashflow/prompts/versions', {
      template_id: templateId,
      system_prompt: 'You are a helpful assistant (v1).',
      user_prompt_template: 'Generate a hook for {{product}}',
    }),
  )) as { data?: { id: string; version: number } } | null;

  const v1Id = v1Result?.data?.id;

  // Step 3: Create version v2
  const v2Result = (await run('3. Create version v2', () =>
    api('POST', '/api/flashflow/prompts/versions', {
      template_id: templateId,
      system_prompt: 'You are a creative copywriter (v2).',
      user_prompt_template: 'Write an engaging hook for {{product}}',
    }),
  )) as { data?: { id: string; version: number } } | null;

  const v2Id = v2Result?.data?.id;

  // Step 4: Assign v1 (strategy: all)
  if (v1Id) {
    await run('4. Assign v1 (strategy: all)', () =>
      api('POST', '/api/flashflow/prompts/assign', {
        template_id: templateId,
        active_version_id: v1Id,
        rollout_strategy: 'all',
      }),
    );
  }

  // Step 5: Re-assign v2 (strategy: percent, 50%)
  if (v2Id) {
    await run('5. Re-assign v2 (strategy: percent, 50%)', () =>
      api('POST', '/api/flashflow/prompts/assign', {
        template_id: templateId,
        active_version_id: v2Id,
        rollout_strategy: 'percent',
        rollout_percent: 50,
      }),
    );
  }

  // Step 6: GET report for current week
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await run('6. GET prompt report', () =>
    api('GET', `/api/flashflow/prompts/report?start=${start}&end=${end}`),
  );

  // Step 7: Cleanup — delete template (cascades to versions + assignments)
  await run('7. Cleanup (cascade delete)', async () => {
    // Use supabase admin REST API directly to delete
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for cleanup');
    }
    const res = await fetch(
      `${supabaseUrl}/rest/v1/ff_prompt_templates?id=eq.${templateId}`,
      {
        method: 'DELETE',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: 'return=minimal',
        },
      },
    );
    if (!res.ok) throw new Error(`Cleanup failed: HTTP ${res.status}`);
    return { deleted: true };
  });

  printSummary();
}

function printSummary() {
  console.log('\n' + '='.repeat(40));
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} steps`);
  if (failed === 0) {
    console.log('OVERALL: PASS');
  } else {
    console.log('OVERALL: FAIL');
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  - ${r.step}: ${r.error}`);
    }
  }
  console.log('='.repeat(40) + '\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
