#!/usr/bin/env npx tsx
/**
 * Marketplace Bootstrap Script
 *
 * Provisions client or VA accounts for the editing marketplace.
 * Uses service role key — run server-side only.
 *
 * Usage:
 *   # Bootstrap a client owner:
 *   BOOTSTRAP_EMAIL=user@example.com CLIENT_NAME="Acme Corp" npx tsx scripts/mp-bootstrap.ts
 *
 *   # Bootstrap a VA editor:
 *   MODE=va VA_EMAIL=editor@example.com LANGUAGES=en,tl npx tsx scripts/mp-bootstrap.ts
 *
 * Environment (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Client mode env:
 *   BOOTSTRAP_EMAIL — auth user email to provision
 *   USER_ID — (optional) auth user id, looked up if not provided
 *   CLIENT_NAME — (optional, default: email prefix)
 *   PLAN_TIER — (optional: pool_15, dedicated_30, scale_50, custom; default: pool_15)
 *   DAILY_CAP — (optional, default: 15)
 *   SLA_HOURS — (optional, default: 48)
 *
 * VA mode env:
 *   MODE=va
 *   VA_EMAIL — auth user email
 *   VA_USER_ID — (optional)
 *   LANGUAGES — (optional, comma-separated, default: en)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generateClientCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `C-${num}`;
}

async function findUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  // Use admin API to find user
  const { data, error } = await svc.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error('Failed to list users:', error.message);
    return null;
  }
  const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return null;
  return { id: user.id, email: user.email! };
}

async function bootstrapClient() {
  const email = process.env.BOOTSTRAP_EMAIL;
  if (!email) {
    console.error('BOOTSTRAP_EMAIL is required for client mode');
    process.exit(1);
  }

  let userId = process.env.USER_ID;
  if (!userId) {
    console.log(`Looking up user by email: ${email}`);
    const found = await findUserByEmail(email);
    if (!found) {
      console.error(`No auth user found with email: ${email}`);
      console.error('Make sure the user has signed up first.');
      process.exit(1);
    }
    userId = found.id;
  }

  const clientName = process.env.CLIENT_NAME || email.split('@')[0];
  const planTier = process.env.PLAN_TIER || 'pool_15';
  const dailyCap = parseInt(process.env.DAILY_CAP || '15', 10);
  const slaHours = parseInt(process.env.SLA_HOURS || '48', 10);

  console.log(`\nBootstrapping client:`);
  console.log(`  User ID: ${userId}`);
  console.log(`  Email: ${email}`);
  console.log(`  Client Name: ${clientName}`);
  console.log(`  Plan: ${planTier}, Cap: ${dailyCap}/day, SLA: ${slaHours}h`);

  // 1. Upsert mp_profiles
  const { error: profileErr } = await svc.from('mp_profiles').upsert({
    id: userId,
    email,
    display_name: clientName,
    role: 'client_owner',
  }, { onConflict: 'id' });
  if (profileErr) {
    console.error('Failed to upsert mp_profiles:', profileErr.message);
    process.exit(1);
  }
  console.log('  [OK] mp_profiles upserted');

  // 2. Check if client already exists for this owner
  const { data: existingClient } = await svc.from('clients')
    .select('id, client_code')
    .eq('owner_user_id', userId)
    .single();

  let clientId: string;
  let clientCode: string;

  if (existingClient) {
    clientId = existingClient.id;
    clientCode = existingClient.client_code;
    console.log(`  [OK] Client already exists: ${clientCode} (${clientId})`);
  } else {
    // Generate unique client code
    clientCode = generateClientCode();
    // Check uniqueness
    const { data: codeCheck } = await svc.from('clients').select('id').eq('client_code', clientCode).single();
    if (codeCheck) {
      clientCode = generateClientCode(); // try once more
    }

    const { data: newClient, error: clientErr } = await svc.from('clients').insert({
      name: clientName,
      client_code: clientCode,
      owner_user_id: userId,
    }).select().single();
    if (clientErr) {
      console.error('Failed to create client:', clientErr.message);
      process.exit(1);
    }
    clientId = newClient.id;
    console.log(`  [OK] Client created: ${clientCode} (${clientId})`);
  }

  // 3. Upsert client_memberships
  const { error: memberErr } = await svc.from('client_memberships').upsert({
    client_id: clientId,
    user_id: userId,
    member_role: 'owner',
  }, { onConflict: 'client_id,user_id' });
  if (memberErr) {
    console.error('Failed to upsert membership:', memberErr.message);
    process.exit(1);
  }
  console.log('  [OK] Membership upserted');

  // 4. Upsert client_plans
  const { error: planErr } = await svc.from('client_plans').upsert({
    client_id: clientId,
    plan_tier: planTier,
    daily_cap: dailyCap,
    sla_hours: slaHours,
  }, { onConflict: 'client_id' });
  if (planErr) {
    console.error('Failed to upsert plan:', planErr.message);
    process.exit(1);
  }
  console.log('  [OK] Plan upserted');

  console.log(`\n=== Client Bootstrap Complete ===`);
  console.log(`  Client ID:   ${clientId}`);
  console.log(`  Client Code: ${clientCode}`);
  console.log(`  User ID:     ${userId}`);
  console.log(`  Portal URL:  /app/pipeline`);
}

async function bootstrapVa() {
  const email = process.env.VA_EMAIL;
  if (!email) {
    console.error('VA_EMAIL is required for VA mode');
    process.exit(1);
  }

  let userId = process.env.VA_USER_ID;
  if (!userId) {
    console.log(`Looking up VA user by email: ${email}`);
    const found = await findUserByEmail(email);
    if (!found) {
      console.error(`No auth user found with email: ${email}`);
      process.exit(1);
    }
    userId = found.id;
  }

  const languages = (process.env.LANGUAGES || 'en').split(',').map(s => s.trim());

  console.log(`\nBootstrapping VA editor:`);
  console.log(`  User ID: ${userId}`);
  console.log(`  Email: ${email}`);
  console.log(`  Languages: ${languages.join(', ')}`);

  // 1. Upsert mp_profiles
  const { error: profileErr } = await svc.from('mp_profiles').upsert({
    id: userId,
    email,
    display_name: email.split('@')[0],
    role: 'va_editor',
  }, { onConflict: 'id' });
  if (profileErr) {
    console.error('Failed to upsert mp_profiles:', profileErr.message);
    process.exit(1);
  }
  console.log('  [OK] mp_profiles upserted');

  // 2. Upsert va_profiles
  const { error: vaErr } = await svc.from('va_profiles').upsert({
    user_id: userId,
    languages,
    active: true,
  }, { onConflict: 'user_id' });
  if (vaErr) {
    console.error('Failed to upsert va_profiles:', vaErr.message);
    process.exit(1);
  }
  console.log('  [OK] va_profiles upserted');

  console.log(`\n=== VA Bootstrap Complete ===`);
  console.log(`  User ID:    ${userId}`);
  console.log(`  Portal URL: /va/jobs`);
}

async function main() {
  const mode = (process.env.MODE || 'client').toLowerCase();

  if (mode === 'va') {
    await bootstrapVa();
  } else {
    await bootstrapClient();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
