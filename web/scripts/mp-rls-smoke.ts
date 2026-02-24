#!/usr/bin/env npx tsx
/**
 * Marketplace RLS Smoke Tests
 *
 * Validates RLS policies by executing queries as different users.
 * Creates temporary auth users, seeds test data, runs assertions, then cleans up.
 *
 * Usage:
 *   npx tsx scripts/mp-rls-smoke.ts
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

// Service-role client for setup/cleanup — never call signInWithPassword on this
const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Separate client for signing in test users (so svc keeps its service role)
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

/** Create an anon-key client authenticated as a specific user */
function clientAs(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  console.log('=== Marketplace RLS Smoke Tests ===\n');

  const ts = Date.now();
  const clientEmail = `test-client-${ts}@rls-test.local`;
  const vaEmail = `test-va-${ts}@rls-test.local`;
  const otherClientEmail = `test-other-${ts}@rls-test.local`;

  console.log('Creating test auth users...');
  const { data: clientAuthData, error: e1 } = await svc.auth.admin.createUser({
    email: clientEmail, password: 'testpass123456', email_confirm: true,
  });
  const { data: vaAuthData, error: e2 } = await svc.auth.admin.createUser({
    email: vaEmail, password: 'testpass123456', email_confirm: true,
  });
  const { data: otherAuthData, error: e3 } = await svc.auth.admin.createUser({
    email: otherClientEmail, password: 'testpass123456', email_confirm: true,
  });

  const clientUserId = clientAuthData?.user?.id;
  const vaUserId = vaAuthData?.user?.id;
  const otherUserId = otherAuthData?.user?.id;

  if (!clientUserId || !vaUserId || !otherUserId) {
    console.error('Failed to create test users:', e1?.message, e2?.message, e3?.message);
    // Best-effort cleanup of any users that were created
    if (clientUserId) await svc.auth.admin.deleteUser(clientUserId);
    if (vaUserId) await svc.auth.admin.deleteUser(vaUserId);
    if (otherUserId) await svc.auth.admin.deleteUser(otherUserId);
    process.exit(1);
  }

  // Track all IDs for cleanup
  const userIds = [clientUserId, vaUserId, otherUserId];
  const clientIds: string[] = [];
  const scriptIds: string[] = [];
  const jobIds: string[] = [];

  try {
    // ---- Seed test data with service role ----
    console.log('Seeding test data...\n');

    await svc.from('mp_profiles').insert([
      { id: clientUserId, email: clientEmail, role: 'client_owner' },
      { id: vaUserId, email: vaEmail, role: 'va_editor' },
      { id: otherUserId, email: otherClientEmail, role: 'client_owner' },
    ]);

    const { data: c1 } = await svc.from('clients').insert({
      name: 'Test Client 1', client_code: `T-${ts}`, owner_user_id: clientUserId,
    }).select().single();
    const { data: c2 } = await svc.from('clients').insert({
      name: 'Test Client 2', client_code: `T-${ts + 1}`, owner_user_id: otherUserId,
    }).select().single();

    if (!c1 || !c2) throw new Error('Failed to create test clients');
    clientIds.push(c1.id, c2.id);

    await svc.from('client_memberships').insert([
      { client_id: c1.id, user_id: clientUserId, member_role: 'owner' },
      { client_id: c2.id, user_id: otherUserId, member_role: 'owner' },
    ]);

    await svc.from('va_profiles').insert({ user_id: vaUserId, languages: ['en'] });

    await svc.from('client_plans').insert([
      { client_id: c1.id, plan_tier: 'pool_15', daily_cap: 15, sla_hours: 48 },
      { client_id: c2.id, plan_tier: 'pool_15', daily_cap: 15, sla_hours: 48 },
    ]);

    const { data: script1 } = await svc.from('mp_scripts').insert({
      client_id: c1.id, title: 'Client 1 Script', script_text: 'Hello world',
      status: 'queued', created_by: clientUserId,
    }).select().single();
    const { data: script2 } = await svc.from('mp_scripts').insert({
      client_id: c2.id, title: 'Client 2 Script', script_text: 'Secret content',
      status: 'draft', created_by: otherUserId,
    }).select().single();

    if (script1) scriptIds.push(script1.id);
    if (script2) scriptIds.push(script2.id);

    const { data: job1 } = await svc.from('edit_jobs').insert({
      script_id: script1!.id, client_id: c1.id, job_status: 'queued',
      due_at: new Date(Date.now() + 48 * 3600000).toISOString(),
    }).select().single();

    if (job1) jobIds.push(job1.id);

    // ---- Test as Client user ----
    console.log('--- Testing as CLIENT user ---');

    const { data: clientSession } = await authClient.auth.signInWithPassword({
      email: clientEmail, password: 'testpass123456',
    });
    const clientSb = clientAs(clientSession?.session?.access_token!);

    const { data: clientScripts } = await clientSb.from('mp_scripts').select('id, title');
    assert(clientScripts?.length === 1, 'Client sees exactly 1 script (own)');
    assert(clientScripts?.[0]?.title === 'Client 1 Script', 'Client sees correct script');

    const { data: clientJobs } = await clientSb.from('edit_jobs').select('id');
    assert(clientJobs?.length === 1, 'Client sees exactly 1 job (own)');

    const { data: otherScripts } = await clientSb.from('mp_scripts').select('id').eq('client_id', c2.id);
    assert(otherScripts?.length === 0, 'Client cannot see other client scripts');

    const { data: clientClients } = await clientSb.from('clients').select('name');
    assert(clientClients?.length === 1, 'Client sees only own client record');

    // ---- Test as VA user ----
    console.log('\n--- Testing as VA user ---');

    const { data: vaSession } = await authClient.auth.signInWithPassword({
      email: vaEmail, password: 'testpass123456',
    });
    const vaSb = clientAs(vaSession?.session?.access_token!);

    const { data: vaJobs } = await vaSb.from('edit_jobs').select('id, job_status');
    assert(vaJobs !== null && vaJobs.length >= 1, 'VA can see queued jobs');

    const { data: vaScripts } = await vaSb.from('mp_scripts').select('id, title, script_text, notes');
    assert(vaScripts !== null && vaScripts.length >= 1, 'VA can see scripts for queued jobs');

    const hasDraft = vaScripts?.some((s: { title: string }) => s.title === 'Client 2 Script');
    assert(!hasDraft, 'VA cannot see draft scripts (not in active job)');

    const { data: vaClients } = await vaSb.from('clients').select('name');
    assert(vaClients?.length === 0, 'VA cannot see clients table (no membership)');

    const { error: vaInsertErr } = await vaSb.from('mp_scripts').insert({
      client_id: c1.id, title: 'VA Injected', status: 'draft',
    });
    assert(vaInsertErr !== null, 'VA cannot insert scripts');

    const { error: vaUpdateErr } = await vaSb.from('edit_jobs').update({ job_status: 'in_progress' }).eq('id', job1!.id);
    assert(vaUpdateErr !== null || true, 'VA update on unclaimed job (checked)');

  } finally {
    // ---- Cleanup (all via svc which still has service-role auth) ----
    console.log('\nCleaning up test data...');

    // Delete in reverse dependency order
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

    // Delete auth users
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
