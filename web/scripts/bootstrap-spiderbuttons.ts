/**
 * Bootstrap Test Account: spiderbuttons@gmail.com
 *
 * Usage: npx tsx scripts/bootstrap-spiderbuttons.ts
 *
 * This script prepares the spiderbuttons@gmail.com account for full
 * end-to-end testing of FlashFlow's creator/admin/pipeline flows.
 *
 * What it does:
 *   1. Finds or identifies the Supabase auth user for spiderbuttons@gmail.com
 *   2. Ensures user_subscriptions record exists (creator plan for full access)
 *   3. Ensures user_credits record exists (generous test credits)
 *   4. Ensures user_roles record = 'admin' (full access to all pages)
 *   5. Creates a test brand ("SpiderButtons Test Brand")
 *   6. Creates a test product under that brand
 *   7. Creates a test posting account ("SpiderTest")
 *   8. Creates sample content items at various pipeline stages
 *   9. Verifies storage bucket access
 *
 * Idempotent — safe to re-run. Uses upsert/ON CONFLICT patterns.
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 *
 * All test data is clearly marked with [TEST] prefix or metadata flags.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = 'spiderbuttons@gmail.com';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(`  ✓ ${msg}`); }
function warn(msg: string) { console.log(`  ⚠ ${msg}`); }
function info(msg: string) { console.log(`  → ${msg}`); }

// ─── Step 1: Find or wait for user ──────────────────────────────────────────

async function findUser(): Promise<{ id: string; email: string } | null> {
  const { data } = await supabase.auth.admin.listUsers();
  const user = data?.users?.find(u => u.email === TEST_EMAIL);
  if (user) return { id: user.id, email: user.email! };
  return null;
}

// ─── Step 2: Ensure subscription ────────────────────────────────────────────

async function ensureSubscription(userId: string) {
  const { data: existing } = await supabase
    .from('user_subscriptions')
    .select('id, plan_id')
    .eq('user_id', userId)
    .single();

  if (existing) {
    // Upgrade to creator plan if on free
    if (existing.plan_id === 'free') {
      await supabase
        .from('user_subscriptions')
        .update({ plan_id: 'creator', status: 'active' })
        .eq('user_id', userId);
      log('Upgraded subscription: free → creator (300 credits/mo)');
    } else {
      log(`Subscription exists: ${existing.plan_id}`);
    }
  } else {
    const { error } = await supabase.from('user_subscriptions').insert({
      user_id: userId,
      plan_id: 'creator',
      subscription_type: 'saas',
      status: 'active',
    });
    if (error) warn(`Subscription insert: ${error.message}`);
    else log('Created subscription: creator plan');
  }
}

// ─── Step 3: Ensure credits ─────────────────────────────────────────────────

async function ensureCredits(userId: string) {
  const { data: existing } = await supabase
    .from('user_credits')
    .select('id, credits_remaining')
    .eq('user_id', userId)
    .single();

  if (existing) {
    if (existing.credits_remaining < 100) {
      await supabase
        .from('user_credits')
        .update({ credits_remaining: 500, free_credits_total: 500 })
        .eq('user_id', userId);
      log('Topped up credits → 500');
    } else {
      log(`Credits OK: ${existing.credits_remaining} remaining`);
    }
  } else {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { error } = await supabase.from('user_credits').insert({
      user_id: userId,
      credits_remaining: 500,
      free_credits_total: 500,
      free_credits_used: 0,
      credits_used_this_period: 0,
      lifetime_credits_used: 0,
      period_start: now.toISOString(),
      period_end: periodEnd.toISOString(),
    });
    if (error) warn(`Credits insert: ${error.message}`);
    else log('Created credits: 500 available');
  }
}

// ─── Step 4: Ensure admin role ──────────────────────────────────────────────

async function ensureRole(userId: string) {
  const { error } = await supabase
    .from('user_roles')
    .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id' });
  if (error) warn(`Role upsert: ${error.message}`);
  else log('Role set: admin');
}

// ─── Step 5: Create test brand ──────────────────────────────────────────────

async function ensureBrand(userId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('brands')
    .select('id')
    .eq('user_id', userId)
    .eq('name', '[TEST] SpiderButtons Brand')
    .single();

  if (existing) {
    log(`Brand exists: ${existing.id}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('brands')
    .insert({
      user_id: userId,
      name: '[TEST] SpiderButtons Brand',
      website: 'https://flashflowai.com',
      tone_of_voice: 'energetic, relatable, trend-aware',
      target_audience: 'Gen Z and millennial content creators',
      guidelines: 'Test brand for internal pipeline testing. Not a real brand.',
      monthly_video_quota: 100,
      is_active: true,
    })
    .select('id')
    .single();

  if (error) { warn(`Brand insert: ${error.message}`); return null; }
  log(`Brand created: ${data.id}`);
  return data.id;
}

// ─── Step 6: Create test product ────────────────────────────────────────────

async function ensureProduct(userId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('user_id', userId)
    .eq('name', '[TEST] Pipeline Test Product')
    .single();

  if (existing) {
    log(`Product exists: ${existing.id}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      user_id: userId,
      name: '[TEST] Pipeline Test Product',
      brand: '[TEST] SpiderButtons Brand',
      category: 'Testing',
      notes: 'Internal test product for pipeline flow verification.',
    })
    .select('id')
    .single();

  if (error) { warn(`Product insert: ${error.message}`); return null; }
  log(`Product created: ${data.id}`);
  return data.id;
}

// ─── Step 7: Ensure posting account ─────────────────────────────────────────

async function ensurePostingAccount(): Promise<string | null> {
  const { data: existing } = await supabase
    .from('posting_accounts')
    .select('id')
    .eq('account_code', 'SPTEST')
    .single();

  if (existing) {
    log(`Posting account exists: ${existing.id}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('posting_accounts')
    .insert({
      display_name: '[TEST] SpiderTest',
      account_code: 'SPTEST',
      platform: 'tiktok',
      is_active: true,
    })
    .select('id')
    .single();

  if (error) { warn(`Posting account insert: ${error.message}`); return null; }
  log(`Posting account created: ${data.id}`);
  return data.id;
}

// ─── Step 8: Create sample content items ────────────────────────────────────

async function ensureContentItems(
  userId: string,
  brandId: string | null,
  productId: string | null,
  postingAccountId: string | null
) {
  // Check if we already have test content items
  const { count } = await supabase
    .from('content_items')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', userId)
    .like('title', '%[TEST]%');

  if ((count || 0) >= 3) {
    log(`Content items exist (${count} [TEST] items)`);
    return;
  }

  const items = [
    {
      workspace_id: userId,
      brand_id: brandId,
      product_id: productId,
      title: '[TEST] Pipeline Briefing Item',
      status: 'briefing',
      source_type: 'manual',
    },
    {
      workspace_id: userId,
      brand_id: brandId,
      product_id: productId,
      title: '[TEST] Ready to Record Item',
      status: 'ready_to_record',
      source_type: 'manual',
    },
    {
      workspace_id: userId,
      brand_id: brandId,
      product_id: productId,
      title: '[TEST] Editing Stage Item',
      status: 'editing',
      source_type: 'manual',
      posting_account_id: postingAccountId,
    },
    {
      workspace_id: userId,
      brand_id: brandId,
      product_id: productId,
      title: '[TEST] Ready to Post Item',
      status: 'ready_to_post',
      source_type: 'manual',
      posting_account_id: postingAccountId,
    },
  ];

  for (const item of items) {
    const { error } = await supabase.from('content_items').insert(item);
    if (error) warn(`Content item "${item.title}": ${error.message}`);
  }
  log(`Created ${items.length} test content items across pipeline stages`);
}

// ─── Step 9: Verify storage buckets ─────────────────────────────────────────

async function verifyStorageBuckets() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) { warn(`Storage bucket list: ${error.message}`); return; }

  const required = ['renders', 'video-files', 'raw-footage'];
  const existing = new Set(buckets?.map(b => b.id) || []);

  for (const name of required) {
    if (existing.has(name)) {
      log(`Bucket exists: ${name}`);
    } else {
      // Try to create it
      const isPublic = name !== 'raw-footage';
      const { error: createErr } = await supabase.storage.createBucket(name, {
        public: isPublic,
      });
      if (createErr) warn(`Bucket create ${name}: ${createErr.message}`);
      else log(`Bucket created: ${name} (public=${isPublic})`);
    }
  }
}

// ─── Step 10: Ensure brand membership ───────────────────────────────────────

async function ensureBrandMembership(userId: string, brandId: string) {
  const { data: existing } = await supabase
    .from('brand_members')
    .select('id')
    .eq('brand_id', brandId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    log(`Brand membership exists`);
    return;
  }

  const { error } = await supabase
    .from('brand_members')
    .insert({
      brand_id: brandId,
      user_id: userId,
      role: 'operator',
      invited_by: userId,
    });

  if (error) warn(`Brand membership: ${error.message}`);
  else log('Brand membership created: operator role');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('FlashFlow — Bootstrap spiderbuttons@gmail.com');
  console.log('='.repeat(50));
  console.log('');

  // Step 1: Find user
  console.log('[1/9] Finding user...');
  const user = await findUser();

  if (!user) {
    console.log('');
    console.log('  User not found in Supabase auth.');
    console.log('  You need to sign in once first to create the auth record.');
    console.log('');
    console.log('  Steps:');
    console.log('    1. Run: npm run dev');
    console.log('    2. Go to: http://localhost:3000/login');
    console.log('    3. Click "Continue with Google"');
    console.log('    4. Sign in with spiderbuttons@gmail.com');
    console.log('    5. After landing on dashboard, re-run this script');
    console.log('');
    console.log('  Note: Google OAuth must be enabled in Supabase dashboard:');
    console.log('    → https://supabase.com/dashboard/project/qqyrwwvtxzrwbyqegpme/auth/providers');
    console.log('    → Enable Google provider');
    console.log('    → Set OAuth client ID and secret from Google Cloud Console');
    console.log('');
    process.exit(0);
  }

  info(`Found user: ${user.email} (${user.id})`);
  console.log('');

  // Step 2: Subscription
  console.log('[2/9] Ensuring subscription...');
  await ensureSubscription(user.id);

  // Step 3: Credits
  console.log('[3/9] Ensuring credits...');
  await ensureCredits(user.id);

  // Step 4: Role
  console.log('[4/9] Setting admin role...');
  await ensureRole(user.id);

  // Step 5: Brand
  console.log('[5/9] Ensuring test brand...');
  const brandId = await ensureBrand(user.id);

  // Step 5b: Brand membership
  if (brandId) {
    console.log('[5b/9] Ensuring brand membership...');
    await ensureBrandMembership(user.id, brandId);
  }

  // Step 6: Product
  console.log('[6/9] Ensuring test product...');
  const productId = await ensureProduct(user.id);

  // Step 7: Posting account
  console.log('[7/9] Ensuring test posting account...');
  const postingAccountId = await ensurePostingAccount();

  // Step 8: Content items
  console.log('[8/9] Ensuring test content items...');
  await ensureContentItems(user.id, brandId, productId, postingAccountId);

  // Step 9: Storage
  console.log('[9/9] Verifying storage buckets...');
  await verifyStorageBuckets();

  // Summary
  console.log('');
  console.log('='.repeat(50));
  console.log('Bootstrap complete!');
  console.log('');
  console.log('Login flow:');
  console.log('  1. npm run dev');
  console.log('  2. http://localhost:3000/login');
  console.log('  3. Click "Continue with Google" → spiderbuttons@gmail.com');
  console.log('  4. Lands on /admin/dashboard');
  console.log('');
  console.log('Key pages:');
  console.log('  Dashboard:       /admin/dashboard');
  console.log('  Footage Hub:     /admin/footage         ← upload raw footage here');
  console.log('  Content Items:   /admin/content-items    ← manage content lifecycle');
  console.log('  Pipeline Board:  /admin/pipeline         ← kanban view of all videos');
  console.log('  Uploader:        /admin/uploader         ← mark videos as posted');
  console.log('  Brands:          /admin/brands           ← manage test brand');
  console.log('  Products:        /admin/products         ← manage test product');
  console.log('  Render Jobs:     /admin/render-jobs      ← monitor processing');
  console.log('');
  console.log(`User ID: ${user.id}`);
  console.log(`Brand ID: ${brandId || 'N/A'}`);
  console.log(`Product ID: ${productId || 'N/A'}`);
  console.log(`Posting Account: ${postingAccountId || 'N/A'}`);
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
