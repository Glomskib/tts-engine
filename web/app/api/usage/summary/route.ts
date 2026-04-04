/**
 * GET /api/usage/summary
 *
 * Returns the current user's plan and usage for the dashboard meter.
 * Lightweight — single DB read per call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId } from '@/lib/api-errors';
import { migrateOldPlanId, getPlanByStringId, getLimit } from '@/lib/plans';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const userId = auth.user.id;

  // Parallel: plan + credits + monthly script count
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [subResult, creditsResult, scriptCountResult] = await Promise.all([
    supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', userId)
      .maybeSingle(),

    supabaseAdmin
      .from('user_credits')
      .select('credits_remaining')
      .eq('user_id', userId)
      .maybeSingle(),

    supabaseAdmin
      .from('scripts')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .gte('created_at', monthStart.toISOString()),
  ]);

  const rawPlanId = subResult.data?.plan_id ?? 'free';
  const planId = migrateOldPlanId(rawPlanId);
  const plan = getPlanByStringId(planId);
  const scriptsLimit = getLimit(planId, 'scriptsPerMonth'); // -1 = unlimited
  const scriptsUsed = scriptCountResult.count ?? 0;
  const creditsRemaining = creditsResult.data?.credits_remaining ?? 0;

  return NextResponse.json({
    ok: true,
    data: {
      plan_id: planId,
      plan_name: plan?.name ?? planId,
      scripts_used: scriptsUsed,
      scripts_limit: scriptsLimit,
      credits_remaining: creditsRemaining,
    },
    correlation_id: correlationId,
  });
}
