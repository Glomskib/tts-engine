#!/usr/bin/env npx tsx
/**
 * Smoke test: Create a campaign (project), create a task within it,
 * then verify the task shows up in a filtered task list.
 *
 * Run:  npx tsx scripts/tests/create-task-from-campaign.test.ts
 *
 * Requires:
 * - A running local dev server at BASE_URL (default http://localhost:3000)
 * - A valid admin session cookie, OR set TEST_ADMIN_COOKIE env var
 *
 * This test creates real records and prints their IDs so you can clean up.
 */
import { strict as assert } from 'node:assert';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const COOKIE = process.env.TEST_ADMIN_COOKIE || '';

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
};
if (COOKIE) headers['Cookie'] = COOKIE;

let passed = 0;
let failed = 0;
const created: { type: string; id: string }[] = [];

function test(name: string, fn: () => Promise<void>) {
  return fn()
    .then(() => {
      passed++;
      console.log(`  PASS  ${name}`);
    })
    .catch((e: unknown) => {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  FAIL  ${name}`);
      console.log(`        ${msg}`);
    });
}

async function run() {
  console.log('\n=== Campaign → Task smoke test ===\n');
  console.log(`Target: ${BASE_URL}\n`);

  let projectId = '';
  let taskId = '';

  // 1. Create a project
  await test('POST create project → 201', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/cc-projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `_smoke_test_${Date.now()}`,
        type: 'other',
        status: 'active',
      }),
    });
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
    const json = await res.json();
    assert.ok(json.ok, 'Response .ok should be true');
    assert.ok(json.data.id, 'Should return project id');
    projectId = json.data.id;
    created.push({ type: 'cc_projects', id: projectId });
  });

  // 2. Create a task with that project_id
  await test('POST create task with project_id → 201', async () => {
    assert.ok(projectId, 'Need project ID from step 1');
    const res = await fetch(`${BASE_URL}/api/admin/cc-projects/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        project_id: projectId,
        title: `_smoke_task_${Date.now()}`,
        assigned_agent: 'human',
        priority: 3,
      }),
    });
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
    const json = await res.json();
    assert.ok(json.ok, 'Response .ok should be true');
    assert.equal(json.data.project_id, projectId, 'Task project_id should match');
    taskId = json.data.id;
    created.push({ type: 'project_tasks', id: taskId });
  });

  // 3. GET tasks filtered by project_id → task appears
  await test('GET tasks?project_id → task appears in list', async () => {
    assert.ok(projectId, 'Need project ID');
    assert.ok(taskId, 'Need task ID');
    const res = await fetch(`${BASE_URL}/api/admin/cc-projects/tasks?project_id=${projectId}`, { headers });
    assert.ok(res.ok, `Expected ok, got ${res.status}`);
    const json = await res.json();
    assert.ok(Array.isArray(json.data), 'Should return data array');
    const found = json.data.some((t: { id: string }) => t.id === taskId);
    assert.ok(found, `Task ${taskId} not found in filtered results`);
  });

  // Summary
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

  if (created.length > 0) {
    console.log('  Cleanup: The following records were created:');
    for (const r of created) {
      console.log(`    - ${r.type}: ${r.id}`);
    }
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
