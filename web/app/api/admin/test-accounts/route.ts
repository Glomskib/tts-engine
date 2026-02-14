import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CREDIT_ALLOCATIONS } from '@/lib/subscriptions';

export const runtime = 'nodejs';

const TEST_EMAIL_PATTERN = 'test-%@flashflowai.com';

const PRESET_ACCOUNTS = [
  { email: 'test-free@flashflowai.com', plan_id: 'free', credits: 5 },
  { email: 'test-creator-lite@flashflowai.com', plan_id: 'creator_lite', credits: 75 },
  { email: 'test-creator-pro@flashflowai.com', plan_id: 'creator_pro', credits: 300 },
  { email: 'test-brand@flashflowai.com', plan_id: 'brand', credits: 1000 },
  { email: 'test-agency@flashflowai.com', plan_id: 'agency', credits: 9999 },
] as const;

const DEFAULT_PASSWORD = 'FlashFlow2026!';

// ---------------------------------------------------------------------------
// GET — list all test accounts
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  // List all auth users with test email pattern
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
  if (authError) {
    return createApiErrorResponse('DB_ERROR', authError.message, 500, correlationId);
  }

  const testUsers = (authData.users || []).filter(
    (u) => u.email && /^test-.*@flashflowai\.com$/.test(u.email)
  );

  if (testUsers.length === 0) {
    return NextResponse.json({ ok: true, accounts: [] });
  }

  const userIds = testUsers.map((u) => u.id);

  // Fetch subscriptions and credits in parallel
  const [subsResult, creditsResult] = await Promise.all([
    supabaseAdmin.from('user_subscriptions').select('user_id, plan_id, status').in('user_id', userIds),
    supabaseAdmin.from('user_credits').select('user_id, credits_remaining').in('user_id', userIds),
  ]);

  const subsMap = new Map((subsResult.data || []).map((s) => [s.user_id, s]));
  const creditsMap = new Map((creditsResult.data || []).map((c) => [c.user_id, c]));

  const accounts = testUsers.map((u) => {
    const sub = subsMap.get(u.id);
    const cred = creditsMap.get(u.id);
    return {
      id: u.id,
      email: u.email,
      plan_id: sub?.plan_id || 'free',
      plan_status: sub?.status || 'none',
      credits_remaining: cred?.credits_remaining ?? 0,
      created_at: u.created_at,
    };
  });

  return NextResponse.json({ ok: true, accounts });
}

// ---------------------------------------------------------------------------
// POST — create / create_preset / delete / reset_credits
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const body = await request.json();
  const { action } = body;

  switch (action) {
    case 'create':
      return handleCreate(body, correlationId);
    case 'create_preset':
      return handleCreatePreset(correlationId);
    case 'delete':
      return handleDelete(body, correlationId);
    case 'reset_credits':
      return handleResetCredits(body, correlationId);
    default:
      return createApiErrorResponse('BAD_REQUEST', `Unknown action: ${action}`, 400, correlationId);
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleCreate(
  body: { email?: string; password?: string; plan_id?: string; credits?: number },
  correlationId: string
) {
  const { email, password = DEFAULT_PASSWORD, plan_id = 'free', credits } = body;

  if (!email) {
    return createApiErrorResponse('BAD_REQUEST', 'email is required', 400, correlationId);
  }

  const creditAmount = credits ?? (CREDIT_ALLOCATIONS[plan_id] || 5);

  return createTestAccount(email, password, plan_id, creditAmount, correlationId);
}

async function handleCreatePreset(correlationId: string) {
  const results: { email: string; status: string; error?: string }[] = [];

  for (const preset of PRESET_ACCOUNTS) {
    try {
      // Check if already exists
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const existing = (authData.users || []).find((u) => u.email === preset.email);

      if (existing) {
        results.push({ email: preset.email, status: 'already_exists' });
        continue;
      }

      const res = await createTestAccount(preset.email, DEFAULT_PASSWORD, preset.plan_id, preset.credits, correlationId);
      const resBody = await res.json();
      results.push({
        email: preset.email,
        status: resBody.ok ? 'created' : 'error',
        error: resBody.ok ? undefined : resBody.error,
      });
    } catch (err) {
      results.push({
        email: preset.email,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}

async function handleDelete(body: { userId?: string }, correlationId: string) {
  const { userId } = body;
  if (!userId) {
    return createApiErrorResponse('BAD_REQUEST', 'userId is required', 400, correlationId);
  }

  // Verify this is a test account
  const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!authData?.user?.email || !/^test-.*@flashflowai\.com$/.test(authData.user.email)) {
    return createApiErrorResponse('BAD_REQUEST', 'Can only delete test accounts', 400, correlationId);
  }

  // Delete cascades handle subscriptions/credits via FK ON DELETE CASCADE
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, deleted: userId });
}

async function handleResetCredits(body: { userId?: string }, correlationId: string) {
  const { userId } = body;
  if (!userId) {
    return createApiErrorResponse('BAD_REQUEST', 'userId is required', 400, correlationId);
  }

  // Get the user's plan to determine default credits
  const { data: sub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .single();

  const planId = sub?.plan_id || 'free';
  const defaultCredits = CREDIT_ALLOCATIONS[planId] || 5;

  const { error } = await supabaseAdmin
    .from('user_credits')
    .upsert(
      {
        user_id: userId,
        credits_remaining: defaultCredits,
        credits_used_this_period: 0,
        free_credits_used: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, credits_remaining: defaultCredits });
}

// ---------------------------------------------------------------------------
// Shared account creation
// ---------------------------------------------------------------------------

async function createTestAccount(
  email: string,
  password: string,
  planId: string,
  credits: number,
  correlationId: string
): Promise<NextResponse> {
  // 1. Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return createApiErrorResponse('DB_ERROR', authError.message, 500, correlationId);
  }

  const userId = authData.user.id;

  // 2. Create subscription
  const { error: subError } = await supabaseAdmin.from('user_subscriptions').upsert(
    {
      user_id: userId,
      plan_id: planId,
      status: 'active',
      subscription_type: 'saas',
    },
    { onConflict: 'user_id' }
  );

  if (subError) {
    console.error(`[${correlationId}] Failed to create subscription for ${email}:`, subError);
  }

  // 3. Create credits
  const { error: creditError } = await supabaseAdmin.from('user_credits').upsert(
    {
      user_id: userId,
      credits_remaining: credits,
      free_credits_total: credits,
    },
    { onConflict: 'user_id' }
  );

  if (creditError) {
    console.error(`[${correlationId}] Failed to create credits for ${email}:`, creditError);
  }

  return NextResponse.json({
    ok: true,
    account: { id: userId, email, plan_id: planId, credits_remaining: credits },
  });
}
