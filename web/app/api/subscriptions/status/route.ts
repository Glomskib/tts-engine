/**
 * Subscription Status API
 * Returns user's current subscription status.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { PLAN_DETAILS, migrateOldPlanId, type PlanName } from '@/lib/subscriptions';

export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = authContext.user.id;

  // Get subscription
  const { data: subscription } = await supabaseAdmin
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Get credits
  const { data: credits } = await supabaseAdmin
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single();

  const planId = migrateOldPlanId(subscription?.plan_id || 'free') as PlanName;
  const plan = PLAN_DETAILS[planId];

  return NextResponse.json({
    ok: true,
    data: {
      subscription: {
        planId: planId,
        planName: plan?.name || 'Free',
        subscriptionType: subscription?.subscription_type || 'saas',
        status: subscription?.status || 'active',
        stripeCustomerId: subscription?.stripe_customer_id,
        stripeSubscriptionId: subscription?.stripe_subscription_id,
        currentPeriodStart: subscription?.current_period_start,
        currentPeriodEnd: subscription?.current_period_end,
      },
      credits: {
        remaining: credits?.credits_remaining ?? 5,
        usedThisPeriod: credits?.credits_used_this_period ?? 0,
        periodStart: credits?.period_start,
        periodEnd: credits?.period_end,
      },
      videos: subscription?.subscription_type === 'video_editing' ? {
        remaining: subscription?.videos_remaining ?? 0,
        usedThisMonth: subscription?.videos_used_this_month ?? 0,
        perMonth: subscription?.videos_per_month ?? 0,
      } : null,
      isAdmin: authContext.isAdmin,
    },
  });
}
