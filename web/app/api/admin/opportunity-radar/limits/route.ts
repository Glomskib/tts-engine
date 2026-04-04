/**
 * API: Opportunity Radar — Plan Limits
 *
 * GET /api/admin/opportunity-radar/limits — current workspace usage + plan limits
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';
import { getRadarLimitDisplay } from '@/lib/opportunity-radar/limits';
import { migrateOldPlanId } from '@/lib/plans';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = getWorkspaceId(authContext);

  // Get plan
  const { data: sub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', authContext.user.id)
    .maybeSingle();

  const planId = migrateOldPlanId(sub?.plan_id || 'free');

  // Count active creators
  const { count } = await supabaseAdmin
    .from('creator_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);

  const limits = getRadarLimitDisplay(planId, count ?? 0);

  return NextResponse.json({
    ok: true,
    data: limits,
    correlation_id: correlationId,
  });
}
