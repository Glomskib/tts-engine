/**
 * GET /api/usage/daily
 *
 * Returns today's raw daily usage counters + the resolved billing plan
 * bucket for the authenticated user. Used by client-side upgrade trigger
 * gates (e.g. "hide Make 3 Variations on free after 1 use").
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getDailyUsage, getUserPlan } from '@/lib/usage/dailyUsage';
import { resolveBillingPlan } from '@/lib/billing/plans';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const [usage, rawPlan] = await Promise.all([
    getDailyUsage(auth.user.id),
    getUserPlan(auth.user.id),
  ]);
  return NextResponse.json({
    ok: true,
    usage,
    plan: resolveBillingPlan(rawPlan),
    raw_plan: rawPlan,
  });
}
