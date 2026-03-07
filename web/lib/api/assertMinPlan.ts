/**
 * assertMinPlan — server-side plan gate for API routes.
 *
 * Fetches the authenticated user's current plan from the DB (never trusts
 * client-provided values) and returns a 403 Response if they don't meet
 * the minimum plan requirement, or null if the check passes.
 *
 * Usage:
 *   const deny = await assertMinPlan(auth, 'creator_pro');
 *   if (deny) return deny;
 *
 * This is the server-side enforcement counterpart to the <PlanGate> UI component.
 * Both must be present — UI gating alone is not a security control.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { meetsMinPlan } from '@/lib/plans';
import type { AuthContext } from '@/lib/supabase/api-auth';

export async function assertMinPlan(
  auth: AuthContext,
  minPlan: string
): Promise<Response | null> {
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  // Admins bypass plan gates
  if (auth.isAdmin) return null;

  // Fetch plan from DB — never trust client-provided values
  const { data } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const userPlan = data?.plan_id ?? 'free';

  if (!meetsMinPlan(userPlan, minPlan)) {
    return NextResponse.json(
      {
        ok: false,
        error: `This feature requires the ${minPlan} plan or higher.`,
        required_plan: minPlan,
        current_plan: userPlan,
        upgrade_url: '/pricing',
      },
      { status: 403 }
    );
  }

  return null;
}
