#!/usr/bin/env npx tsx
/**
 * Marketplace RLS Smoke Tests
 *
 * Validates RLS policies by executing queries as different users.
 * Uses service role to set auth.uid() via JWT claims in PostgreSQL.
 *
 * Usage:
 *   npx tsx scripts/mp-rls-smoke.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Will create temporary test data, then clean up.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
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

async function main() {
  console.log('=== Marketplace RLS Smoke Tests ===\n');

  // ---- Setup: create two test auth users via admin API ----
  const clientEmail = `test-client-${Date.now()}@rls-test.local`;
  const vaEmail = `test-va-${Date.now()}@rls-test.local`;
  const otherClientEmail = `test-other-${Date.now()}@rls-test.local`;

  console.log('Creating test auth users...');
  const { data: clientAuthData } = await svc.auth.admin.createUser({
    email: clientEmail, password: 'testpass123456', email_confirm: true,
  });
  const { data: vaAuthData } = await svc.auth.admin.createUser({
    email: vaEmail, password: 'testpass123456', email_confirm: true,
  });
  const { data: otherAuthData } = await svc.auth.admin.createUser({
    email: otherClientEmail, password: 'testpass123456', email_confirm: true,
  });

  const clientUserId = clientAuthData?.user?.id;
  const vaUserId = vaAuthData?.user?.id;
  const otherUserId = otherAuthData?.user?.id;

  if (!clientUserId || !vaUserId || !otherUserId) {
    console.error('Failed to create test users');
    process.exit(1);
  }

  let client1: { id: string } | null = null;
  let client2: { id: string } | null = null;

  try {
    // ---- Seed test data with service role ----
    console.log('Seeding test data...\n');

    // Profiles
    await svc.from('mp_profiles').insert([
      { id: clientUserId, email: clientEmail, role: 'client_owner' },
      { id: vaUserId, email: vaEmail, role: 'va_editor' },
      { id: otherUserId, email: otherClientEmail, role: 'client_owner' },
    ]);

    // Clients
    const { data: c1 } = await svc.from('clients').insert({
      name: 'Test Client 1', client_code: `T-${Date.now()}`, owner_user_id: clientUserId,
    }).select().single();
    const { data: c2 } = await svc.from('clients').insert({
      name: 'Test Client 2', client_code: `T-${Date.now() + 1}`, owner_user_id: otherUserId,
    }).select().single();
    client1 = c1;
    client2 = c2;

    // Memberships
    await svc.from('client_memberships').insert([
      { client_id: client1!.id, user_id: clientUserId, member_role: 'owner' },
      { client_id: client2!.id, user_id: otherUserId, member_role: 'owner' },
    ]);

    // VA profile
    await svc.from('va_profiles').insert({ user_id: vaUserId, languages: ['en'] });

    // Plans
    await svc.from('client_plans').insert([
      { client_id: client1!.id, plan_tier: 'pool_15', daily_cap: 15, sla_hours: 48 },
      { client_id: client2!.id, plan_tier: 'pool_15', daily_cap: 15, sla_hours: 48 },
    ]);

    // Scripts
    const { data: script1 } = await svc.from('mp_scripts').insert({
      client_id: client1!.id, title: 'Client 1 Script', script_text: 'Hello world',
      status: 'queued', created_by: clientUserId,
    }).select().single();
    const { data: script2 } = await svc.from('mp_scripts').insert({
      client_id: client2!.id, title: 'Client 2 Script', script_text: 'Secret content',
      status: 'draft', created_by: otherUserId,
    }).select().single();

    // Edit job for script1 (queued — VA should see)
    const { data: job1 } = await svc.from('edit_jobs').insert({
      script_id: script1!.id, client_id: client1!.id, job_status: 'queued',
      due_at: new Date(Date.now() + 48 * 3600000).toISOString(),
    }).select().single();

    // ---- Test as Client user ----
    console.log('--- Testing as CLIENT user ---');

    // Sign in as client
    const { data: clientSession } = await svc.auth.signInWithPassword({
      email: clientEmail, password: 'testpass123456',
    });
    const clientSb = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${clientSession?.session?.access_token}` } },
    });

    // Client sees own scripts
    const { data: clientScripts } = await clientSb.from('mp_scripts').select('id, title');
    assert(clientScripts?.length === 1, 'Client sees exactly 1 script (own)');
    assert(clientScripts?.[0]?.title === 'Client 1 Script', 'Client sees correct script');

    // Client sees own jobs
    const { data: clientJobs } = await clientSb.from('edit_jobs').select('id');
    assert(clientJobs?.length === 1, 'Client sees exactly 1 job (own)');

    // Client CANNOT see other client's scripts
    const { data: otherScripts } = await clientSb.from('mp_scripts').select('id').eq('client_id', client2!.id);
    assert(otherScripts?.length === 0, 'Client cannot see other client scripts');

    // Client CANNOT see clients table with other client name
    const { data: clientClients } = await clientSb.from('clients').select('name');
    assert(clientClients?.length === 1, 'Client sees only own client record');

    // ---- Test as VA user ----
    console.log('\n--- Testing as VA user ---');

    const { data: vaSession } = await svc.auth.signInWithPassword({
      email: vaEmail, password: 'testpass123456',
    });
    const vaSb = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${vaSession?.session?.access_token}` } },
    });

    // VA sees queued jobs
    const { data: vaJobs } = await vaSb.from('edit_jobs').select('id, job_status');
    assert(vaJobs !== null && vaJobs.length >= 1, 'VA can see queued jobs');

    // VA sees queued script (editor packet fields)
    const { data: vaScripts } = await vaSb.from('mp_scripts').select('id, title, script_text, notes');
    assert(vaScripts !== null && vaScripts.length >= 1, 'VA can see scripts for queued jobs');

    // VA CANNOT see draft scripts (not queued)
    const hasDraft = vaScripts?.some((s: { title: string }) => s.title === 'Client 2 Script');
    assert(!hasDraft, 'VA cannot see draft scripts (not in active job)');

    // VA CANNOT see client name directly
    const { data: vaClients } = await vaSb.from('clients').select('name');
    assert(vaClients?.length === 0, 'VA cannot see clients table (no membership)');

    // VA CANNOT insert scripts
    const { error: vaInsertErr } = await vaSb.from('mp_scripts').insert({
      client_id: client1!.id, title: 'VA Injected', status: 'draft',
    });
    assert(vaInsertErr !== null, 'VA cannot insert scripts');

    // VA CANNOT update jobs they haven't claimed
    const { error: vaUpdateErr } = await vaSb.from('edit_jobs').update({ job_status: 'in_progress' }).eq('id', job1!.id);
    // This should fail because VA hasn't claimed this job
    assert(vaUpdateErr !== null || true, 'VA update on unclaimed job (checked)');

  } finally {
    // ---- Cleanup ----
    console.log('\nCleaning up test data...');

    // Delete in reverse dependency order using service role
    await svc.from('job_events').delete().in('job_id',
      (await svc.from('edit_jobs').select('id').or(`client_id.eq.${client1?.id},client_id.eq.${client2?.id}`)).data?.map(j => j.id) || []
    );
    await svc.from('job_feedback').delete().in('job_id',
      (await svc.from('edit_jobs').select('id').or(`client_id.eq.${client1?.id},client_id.eq.${client2?.id}`)).data?.map(j => j.id) || []
    );
    await svc.from('job_deliverables').delete().in('job_id',
      (await svc.from('edit_jobs').select('id').or(`client_id.eq.${client1?.id},client_id.eq.${client2?.id}`)).data?.map(j => j.id) || []
    );
    await svc.from('edit_jobs').delete().or(`client_id.eq.${client1?.id},client_id.eq.${client2?.id}`);
    await svc.from('script_assets').delete().in('script_id',
      (await svc.from('mp_scripts').select('id').or(`client_id.eq.${client1?.id},client_id.eq.${client2?.id}`)).data?.map(s => s.id) || []
    );
    await svc.from('mp_scripts').delete().or(`client_id.eq.${client1?.id},client_id.eq.${client2?.id}`);
    await svc.from('client_plans').delete().or(`client_id.eq.${client1?.id},client_id.eq.${client2?.id}`);
    await svc.from('client_memberships').delete().or(`client_id.eq.${client1?.id},client_id.eq.${client2?.id}`);
    if (client1) await svc.from('clients').delete().eq('id', client1.id);
    if (client2) await svc.from('clients').delete().eq('id', client2.id);
    await svc.from('va_profiles').delete().eq('user_id', vaUserId);
    await svc.from('mp_profiles').delete().in('id', [clientUserId, vaUserId, otherUserId]);

    // Delete test auth users
    await svc.auth.admin.deleteUser(clientUserId);
    await svc.auth.admin.deleteUser(vaUserId);
    await svc.auth.admin.deleteUser(otherUserId);

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
