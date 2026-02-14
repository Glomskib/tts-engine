import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CREDIT_ALLOCATIONS } from '@/lib/subscriptions';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET — list ALL users with subscriptions, credits, roles
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

  try {
    // Fetch all auth users
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (authError) {
      return createApiErrorResponse('DB_ERROR', authError.message, 500, correlationId);
    }

    const allUsers = authData.users || [];
    const userIds = allUsers.map((u) => u.id);

    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, users: [] });
    }

    // Fetch related data in parallel
    const [subsResult, creditsResult, rolesResult] = await Promise.all([
      supabaseAdmin.from('user_subscriptions').select('user_id, plan_id, status').in('user_id', userIds),
      supabaseAdmin.from('user_credits').select('user_id, credits_remaining, lifetime_credits_used').in('user_id', userIds),
      supabaseAdmin.from('user_roles').select('user_id, role').in('user_id', userIds),
    ]);

    const subsMap = new Map((subsResult.data || []).map((s) => [s.user_id, s]));
    const creditsMap = new Map((creditsResult.data || []).map((c) => [c.user_id, c]));
    const rolesMap = new Map((rolesResult.data || []).map((r) => [r.user_id, r]));

    const users = allUsers.map((u) => {
      const sub = subsMap.get(u.id);
      const cred = creditsMap.get(u.id);
      const role = rolesMap.get(u.id);
      const isTest = u.email && /^test-.*@flashflowai\.com$/.test(u.email);

      return {
        id: u.id,
        email: u.email || null,
        plan_id: sub?.plan_id || 'free',
        plan_status: sub?.status || 'none',
        credits_remaining: cred?.credits_remaining ?? 0,
        lifetime_credits_used: cred?.lifetime_credits_used ?? 0,
        role: role?.role || 'creator',
        email_confirmed: !!u.email_confirmed_at,
        last_sign_in: u.last_sign_in_at || null,
        created_at: u.created_at,
        is_test: isTest,
      };
    });

    // Sort: real users first (by created_at desc), then test accounts
    users.sort((a, b) => {
      if (a.is_test !== b.is_test) return a.is_test ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json({ ok: true, users });
  } catch (err) {
    console.error('[admin/users/manage] GET error:', err);
    return createApiErrorResponse('DB_ERROR', 'Internal server error', 500, correlationId);
  }
}

// ---------------------------------------------------------------------------
// POST — user management actions
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const { action, userId } = body as { action: string; userId: string };

  if (!action) {
    return createApiErrorResponse('BAD_REQUEST', 'action is required', 400, correlationId);
  }
  if (!userId && action !== 'create_preset') {
    return createApiErrorResponse('BAD_REQUEST', 'userId is required', 400, correlationId);
  }

  switch (action) {
    case 'change_plan':
      return handleChangePlan(userId, body.plan_id as string, correlationId);
    case 'reset_credits':
      return handleResetCredits(userId, correlationId);
    case 'change_role':
      return handleChangeRole(userId, body.role as string, correlationId);
    case 'confirm_email':
      return handleConfirmEmail(userId, correlationId);
    case 'reset_password':
      return handleResetPassword(userId, correlationId);
    case 'delete_user':
      return handleDeleteUser(userId, correlationId);
    default:
      return createApiErrorResponse('BAD_REQUEST', `Unknown action: ${action}`, 400, correlationId);
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleChangePlan(userId: string, planId: string, correlationId: string) {
  const validPlans = ['free', 'creator_lite', 'creator_pro', 'brand', 'agency'];
  if (!planId || !validPlans.includes(planId)) {
    return createApiErrorResponse('BAD_REQUEST', `Invalid plan_id. Must be one of: ${validPlans.join(', ')}`, 400, correlationId);
  }

  const { error } = await supabaseAdmin.from('user_subscriptions').upsert(
    {
      user_id: userId,
      plan_id: planId,
      status: 'active',
      subscription_type: 'saas',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Also reset credits to the new plan's allocation
  const newCredits = CREDIT_ALLOCATIONS[planId] || 5;
  await supabaseAdmin.from('user_credits').upsert(
    {
      user_id: userId,
      credits_remaining: newCredits,
      credits_used_this_period: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  return NextResponse.json({ ok: true, plan_id: planId, credits_remaining: newCredits });
}

async function handleResetCredits(userId: string, correlationId: string) {
  // Get current plan to determine default credits
  const { data: sub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .single();

  const planId = sub?.plan_id || 'free';
  const defaultCredits = CREDIT_ALLOCATIONS[planId] || 5;

  const { error } = await supabaseAdmin.from('user_credits').upsert(
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

async function handleChangeRole(userId: string, role: string, correlationId: string) {
  const validRoles = ['admin', 'creator', 'editor', 'va'];
  if (!role || !validRoles.includes(role)) {
    return createApiErrorResponse('BAD_REQUEST', `Invalid role. Must be one of: ${validRoles.join(', ')}`, 400, correlationId);
  }

  const { error } = await supabaseAdmin.from('user_roles').upsert(
    {
      user_id: userId,
      role,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, role });
}

async function handleConfirmEmail(userId: string, correlationId: string) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, confirmed: true });
}

async function handleResetPassword(userId: string, correlationId: string) {
  // Get user email first
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData?.user?.email) {
    return createApiErrorResponse('DB_ERROR', 'Could not find user email', 500, correlationId);
  }

  // Generate a password reset link
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: userData.user.email,
  });

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    reset_link: data.properties?.action_link || null,
    email: userData.user.email,
  });
}

async function handleDeleteUser(userId: string, correlationId: string) {
  // FK ON DELETE CASCADE handles subscriptions/credits/roles
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, deleted: userId });
}
