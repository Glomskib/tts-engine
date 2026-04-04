/**
 * API: Opportunity Radar — Creator Watchlist
 *
 * GET  /api/admin/opportunity-radar/watchlist   — list entries + usage limits
 * POST /api/admin/opportunity-radar/watchlist   — add creator (plan-gated)
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';
import { canAddCreator, getRadarLimitDisplay } from '@/lib/opportunity-radar/limits';
import { ensureCreatorSource, linkWatchlistToSource, recalcSourceCadence } from '@/lib/opportunity-radar/scheduler';
import { migrateOldPlanId } from '@/lib/plans';

export const runtime = 'nodejs';

/** Resolve the user's plan ID from their subscription */
async function getUserPlanId(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .maybeSingle();
  return migrateOldPlanId(data?.plan_id || 'free');
}

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const url = new URL(request.url);
  const niche = url.searchParams.get('niche');
  const priority = url.searchParams.get('priority');
  const isActive = url.searchParams.get('is_active');
  const platform = url.searchParams.get('platform');

  let query = supabaseAdmin
    .from('creator_watchlist')
    .select('*, observation_count:creator_product_observations(count), creator_source:creator_sources(last_checked_at, next_check_at, monitoring_status, scan_interval_hours, last_check_status)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (niche) query = query.ilike('niche', `%${niche}%`);
  if (priority) query = query.eq('priority', priority);
  if (isActive !== null && isActive !== undefined && isActive !== '') {
    query = query.eq('is_active', isActive === 'true');
  }
  if (platform) query = query.eq('platform', platform);

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Flatten nested count from Supabase
  const rows = (data || []).map((row: Record<string, unknown>) => {
    const countArr = row.observation_count as { count: number }[] | null;
    return {
      ...row,
      observation_count: countArr?.[0]?.count ?? 0,
    };
  });

  // Sort: priority order (critical > high > medium > low), then by created_at
  const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  rows.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const pa = PRIORITY_ORDER[a.priority as string] ?? 99;
    const pb = PRIORITY_ORDER[b.priority as string] ?? 99;
    if (pa !== pb) return pa - pb;
    return 0; // DB already sorts by created_at DESC
  });

  // Get plan usage info
  const planId = await getUserPlanId(authContext.user.id);
  const activeCount = rows.filter((r: Record<string, unknown>) => r.is_active).length;
  const limits = getRadarLimitDisplay(planId, activeCount);

  return NextResponse.json({
    ok: true,
    data: rows,
    limits,
    correlation_id: correlationId,
  });
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const body = await request.json();
  const { handle, platform, display_name, niche, follower_count, priority, notes, tags, avatar_url, source } = body;

  if (!handle?.trim() || !platform?.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'handle and platform are required', 400, correlationId);
  }

  // ── Plan limit enforcement ─────────────────────────────
  const planId = await getUserPlanId(authContext.user.id);
  const { count: currentCount } = await supabaseAdmin
    .from('creator_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);

  const gate = canAddCreator(planId, currentCount ?? 0);
  if (!gate.allowed) {
    return NextResponse.json({
      ok: false,
      error_code: 'PLAN_LIMIT',
      message: gate.message,
      limit: gate.limit,
      current: currentCount ?? 0,
      correlation_id: correlationId,
    }, { status: 403 });
  }

  // Validate enum values
  const validPlatforms = ['tiktok', 'instagram', 'youtube', 'other'];
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  const validSources = ['manual', 'import', 'openclaw', 'automation'];

  const platformVal = validPlatforms.includes(platform.trim()) ? platform.trim() : 'other';
  const priorityVal = validPriorities.includes(priority) ? priority : 'medium';
  const sourceVal = source && validSources.includes(source) ? source : 'manual';

  const { data, error } = await supabaseAdmin
    .from('creator_watchlist')
    .insert({
      workspace_id: workspaceId,
      created_by: authContext.user.id,
      handle: handle.trim(),
      platform: platformVal,
      display_name: display_name?.trim() || null,
      niche: niche?.trim() || null,
      follower_count: follower_count ?? null,
      priority: priorityVal,
      notes: notes?.trim() || null,
      tags: tags || [],
      avatar_url: avatar_url?.trim() || null,
      source: sourceVal,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return createApiErrorResponse('BAD_REQUEST', `Creator @${handle.trim()} on ${platformVal} is already on your watchlist`, 409, correlationId);
    }
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // ── Link to shared creator_sources (non-blocking) ───────
  try {
    const source = await ensureCreatorSource(platformVal, handle.trim(), display_name?.trim() || undefined);
    await linkWatchlistToSource(data.id, source.id);
    await recalcSourceCadence(source.id);
  } catch (linkErr) {
    console.error('[watchlist POST] creator_sources linking failed:', linkErr instanceof Error ? linkErr.message : linkErr);
    // Non-fatal: the watchlist entry is already created
  }

  return NextResponse.json({
    ok: true,
    data,
    correlation_id: correlationId,
  }, { status: 201 });
}
