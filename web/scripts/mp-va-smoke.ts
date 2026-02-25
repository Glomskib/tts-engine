#!/usr/bin/env npx tsx
/**
 * Marketplace VA Smoke Tests
 *
 * Tests the VA editor workflow: list jobs, claim, start, submit.
 * Verifies no client name leaks and proper state transitions.
 *
 * Usage:
 *   npx tsx scripts/mp-va-smoke.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('Missing env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const authClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}`);
    failed++;
  }
}

function clientAs(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  console.log('=== Marketplace VA Smoke Tests ===\n');

  const ts = Date.now();
  const clientEmail = `va-smoke-client-${ts}@test.local`;
  const vaEmail = `va-smoke-va-${ts}@test.local`;

  console.log('Creating test auth users...');
  const { data: clientAuthData, error: e1 } = await svc.auth.admin.createUser({
    email: clientEmail, password: 'testpass123456', email_confirm: true,
  });
  const { data: vaAuthData, error: e2 } = await svc.auth.admin.createUser({
    email: vaEmail, password: 'testpass123456', email_confirm: true,
  });

  const clientUserId = clientAuthData?.user?.id;
  const vaUserId = vaAuthData?.user?.id;

  if (!clientUserId || !vaUserId) {
    console.error('Failed to create test users:', e1?.message, e2?.message);
    if (clientUserId) await svc.auth.admin.deleteUser(clientUserId);
    if (vaUserId) await svc.auth.admin.deleteUser(vaUserId);
    process.exit(1);
  }

  const userIds = [clientUserId, vaUserId];
  const clientIds: string[] = [];
  const scriptIds: string[] = [];
  const jobIds: string[] = [];

  try {
    // ---- Seed test data ----
    console.log('Seeding test data...\n');

    await svc.from('mp_profiles').insert([
      { id: clientUserId, email: clientEmail, role: 'client_owner' },
      { id: vaUserId, email: vaEmail, role: 'va_editor' },
    ]);

    const { data: client } = await svc.from('clients').insert({
      name: 'VA Smoke Client Secret Name', client_code: `VS-${ts}`, owner_user_id: clientUserId,
    }).select().single();
    if (!client) throw new Error('Failed to create test client');
    clientIds.push(client.id);

    await svc.from('client_memberships').insert({
      client_id: client.id, user_id: clientUserId, member_role: 'owner',
    });
    await svc.from('va_profiles').insert({ user_id: vaUserId, languages: ['en'] });
    await svc.from('client_plans').insert({
      client_id: client.id, plan_tier: 'pool_15', daily_cap: 15, sla_hours: 48,
    });

    const { data: script } = await svc.from('mp_scripts').insert({
      client_id: client.id, title: 'VA Smoke Test Script', script_text: 'Hello world script text',
      notes: 'Editor notes here', status: 'queued', created_by: clientUserId,
    }).select().single();
    if (!script) throw new Error('Failed to create test script');
    scriptIds.push(script.id);

    // Add a raw footage asset
    await svc.from('script_assets').insert({
      script_id: script.id, asset_type: 'raw_video',
      label: 'Test Raw Video', url: 'https://example.com/raw.mp4', created_by: clientUserId,
    });

    const { data: job } = await svc.from('edit_jobs').insert({
      script_id: script.id, client_id: client.id, job_status: 'queued',
      due_at: new Date(Date.now() + 48 * 3600000).toISOString(),
    }).select().single();
    if (!job) throw new Error('Failed to create test job');
    jobIds.push(job.id);

    await svc.from('job_events').insert({
      job_id: job.id, event_type: 'queued', actor_user_id: clientUserId,
    });

    // ---- Sign in as VA ----
    console.log('--- Testing VA Job Board ---');

    const { data: vaSession } = await authClient.auth.signInWithPassword({
      email: vaEmail, password: 'testpass123456',
    });
    const vaSb = clientAs(vaSession?.session?.access_token!);

    // VA can see queued jobs via RLS
    const { data: vaJobs } = await vaSb.from('edit_jobs').select('id, job_status, client_id').in('job_status', ['queued', 'claimed', 'in_progress']);
    assert(vaJobs !== null && vaJobs.some(j => j.id === job.id), 'VA can see the queued job');

    // VA job row should have client_code (from our API), not client name
    // The API route sanitizes, but check raw table access for name leak
    const { data: vaClients } = await vaSb.from('clients').select('name').eq('id', client.id);
    assert(!vaClients || vaClients.length === 0, 'VA cannot read clients table (no name leak)');

    // ---- Verify VA cannot write directly (RLS blocks) ----
    console.log('\n--- Testing RLS Write Protection ---');

    const { data: directClaim } = await vaSb
      .from('edit_jobs')
      .update({ job_status: 'claimed', claimed_by: vaUserId })
      .eq('id', job.id)
      .select();
    assert(!directClaim || directClaim.length === 0, 'VA cannot directly update edit_jobs (RLS blocks writes)');

    const { error: directDelivErr } = await vaSb.from('job_deliverables').insert({
      job_id: job.id, deliverable_type: 'main', label: 'Direct Insert',
      url: 'https://example.com/test', created_by: vaUserId,
    });
    assert(!!directDelivErr, 'VA cannot directly insert deliverables (RLS blocks writes)');

    // ---- Claim Job (via service client, simulating API route) ----
    console.log('\n--- Testing Claim Flow (via API layer) ---');

    const { data: claimed, error: claimErr } = await svc
      .from('edit_jobs')
      .update({ job_status: 'claimed', claimed_by: vaUserId, claimed_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('job_status', 'queued')
      .is('claimed_by', null)
      .select()
      .single();

    assert(!!claimed && claimed.job_status === 'claimed', 'Claim succeeds (service client)');
    assert(claimed?.claimed_by === vaUserId, 'Claimed_by set to VA user');

    // VA can now read the claimed job
    const { data: vaClaimedJob } = await vaSb.from('edit_jobs').select('id, job_status, claimed_by').eq('id', job.id).single();
    assert(vaClaimedJob?.job_status === 'claimed', 'VA can read claimed job status');

    // ---- Start Job ----
    console.log('\n--- Testing Start Flow (via API layer) ---');

    const { data: started } = await svc
      .from('edit_jobs')
      .update({ job_status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('claimed_by', vaUserId)
      .in('job_status', ['claimed', 'changes_requested'])
      .select()
      .single();

    assert(!!started && started.job_status === 'in_progress', 'Start succeeds (service client)');

    // ---- Submit Deliverable ----
    console.log('\n--- Testing Submit Flow (via API layer) ---');

    const { error: delivErr } = await svc.from('job_deliverables').insert({
      job_id: job.id, deliverable_type: 'main', label: 'Smoke Test Edit',
      url: 'https://drive.google.com/file/d/smoke-test', created_by: vaUserId,
    });
    assert(!delivErr, 'Deliverable insert succeeds (service client)');

    const { data: submitted } = await svc
      .from('edit_jobs')
      .update({ job_status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('claimed_by', vaUserId)
      .in('job_status', ['in_progress', 'changes_requested'])
      .select()
      .single();

    assert(!!submitted && submitted.job_status === 'submitted', 'Submit succeeds (service client)');

    // ---- Verify no client name in any VA-accessible response ----
    console.log('\n--- Verifying No Client Name Leak ---');

    const { data: vaJobDetail } = await vaSb.from('edit_jobs').select('*, mp_scripts:mp_scripts!edit_jobs_script_id_fkey(*)').eq('id', job.id).single();
    const jobJson = JSON.stringify(vaJobDetail);
    assert(!jobJson.includes('VA Smoke Client Secret Name'), 'Job detail does not contain client name');

    const { data: vaScriptDetail } = await vaSb.from('mp_scripts').select('*').eq('id', script.id).single();
    const scriptJson = JSON.stringify(vaScriptDetail);
    assert(!scriptJson.includes('VA Smoke Client Secret Name'), 'Script detail does not contain client name');

    // ---- Invalid Transitions ----
    console.log('\n--- Testing Invalid Transitions ---');

    // Job is now 'submitted'; VA should not be able to claim again
    const { data: reClaim } = await vaSb
      .from('edit_jobs')
      .update({ job_status: 'claimed' })
      .eq('id', job.id)
      .eq('job_status', 'queued')
      .is('claimed_by', null)
      .select();
    assert(!reClaim || reClaim.length === 0, 'Cannot re-claim a submitted job');

  } finally {
    // ---- Cleanup ----
    console.log('\nCleaning up test data...');

    for (const jid of jobIds) {
      await svc.from('job_events').delete().eq('job_id', jid);
      await svc.from('job_feedback').delete().eq('job_id', jid);
      await svc.from('job_deliverables').delete().eq('job_id', jid);
    }
    for (const jid of jobIds) {
      await svc.from('edit_jobs').delete().eq('id', jid);
    }
    for (const sid of scriptIds) {
      await svc.from('script_broll_links').delete().eq('script_id', sid);
      await svc.from('script_assets').delete().eq('script_id', sid);
    }
    for (const sid of scriptIds) {
      await svc.from('mp_scripts').delete().eq('id', sid);
    }
    for (const cid of clientIds) {
      await svc.from('plan_usage_daily').delete().eq('client_id', cid);
      await svc.from('client_plans').delete().eq('client_id', cid);
      await svc.from('client_memberships').delete().eq('client_id', cid);
    }
    for (const cid of clientIds) {
      await svc.from('clients').delete().eq('id', cid);
    }
    for (const uid of userIds) {
      await svc.from('va_profiles').delete().eq('user_id', uid);
    }
    await svc.from('mp_profiles').delete().in('id', userIds);

    for (const uid of userIds) {
      await svc.auth.admin.deleteUser(uid);
    }

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
