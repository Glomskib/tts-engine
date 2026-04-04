/**
 * GET /api/opportunities
 *
 * Creator-facing endpoint for the Opportunity Scanner.
 * Returns the top actionable opportunities from the Opportunity Radar system,
 * formatted for creator consumption with recommended actions.
 *
 * POST /api/opportunities
 * Save/dismiss an opportunity for the current user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// ── Types ─────────────────────────────────────────────────────────

interface OpportunityCard {
  id: string;
  topic: string;
  recommendation: 'ACT_NOW' | 'TEST_SOON' | 'WATCH' | 'SKIP';
  score: number;
  earlyness: number;
  saturation: number;
  why_now: string;
  suggested_angle: string;
  signals: {
    creator_count: number;
    signal_count: number;
    velocity_24h: number;
    community_wins: number;
    community_views: number;
    best_hook: string | null;
  };
  first_seen: string | null;
  last_signal: string | null;
  saved: boolean;
}

// ── GET handler ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'actionable'; // actionable | all | saved
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);

  try {
    // Fetch saved opportunity IDs for this user
    const { data: savedRows } = await supabaseAdmin
      .from('saved_opportunities')
      .select('cluster_id')
      .eq('user_id', authContext.user.id);

    const savedIds = new Set((savedRows || []).map(r => r.cluster_id));

    // Build query
    let query = supabaseAdmin
      .from('trend_clusters')
      .select('id, display_name, recommendation, trend_score, earlyness_score, saturation_score, creator_count, signal_count, signals_24h, velocity_score, community_wins, community_total_views, community_best_hook, first_signal_at, last_signal_at, forecast_breakdown, status')
      .eq('workspace_id', workspaceId)
      .neq('status', 'dismissed')
      .order('trend_score', { ascending: false })
      .limit(limit);

    if (filter === 'actionable') {
      query = query.in('recommendation', ['ACT_NOW', 'TEST_SOON']);
    } else if (filter === 'saved') {
      if (savedIds.size === 0) {
        return NextResponse.json({ ok: true, data: [], counts: { act_now: 0, test_soon: 0, watch: 0, total: 0 }, correlation_id: correlationId });
      }
      query = query.in('id', Array.from(savedIds));
    }
    // 'all' has no additional filter

    const { data: clusters, error } = await query;
    if (error) {
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    // Build creator-friendly cards
    const cards: OpportunityCard[] = (clusters || []).map(c => ({
      id: c.id,
      topic: c.display_name || 'Unknown Product',
      recommendation: c.recommendation || 'WATCH',
      score: c.trend_score || 0,
      earlyness: c.earlyness_score || 0,
      saturation: c.saturation_score || 0,
      why_now: buildWhyNow(c),
      suggested_angle: buildSuggestedAngle(c),
      signals: {
        creator_count: c.creator_count || 0,
        signal_count: c.signal_count || 0,
        velocity_24h: c.signals_24h || 0,
        community_wins: c.community_wins || 0,
        community_views: c.community_total_views || 0,
        best_hook: c.community_best_hook || null,
      },
      first_seen: c.first_signal_at,
      last_signal: c.last_signal_at,
      saved: savedIds.has(c.id),
    }));

    // Counts for UI
    const counts = {
      act_now: (clusters || []).filter(c => c.recommendation === 'ACT_NOW').length,
      test_soon: (clusters || []).filter(c => c.recommendation === 'TEST_SOON').length,
      watch: (clusters || []).filter(c => c.recommendation === 'WATCH').length,
      total: (clusters || []).length,
    };

    return NextResponse.json({ ok: true, data: cards, counts, correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] opportunities error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to load opportunities', 500, correlationId);
  }
}

// ── POST handler (save/dismiss) ───────────────────────────────────

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const body = await request.json();
  const { cluster_id, action } = body;

  if (!cluster_id || !action) {
    return createApiErrorResponse('BAD_REQUEST', 'cluster_id and action required', 400, correlationId);
  }

  try {
    if (action === 'save') {
      await supabaseAdmin
        .from('saved_opportunities')
        .upsert({ user_id: authContext.user.id, cluster_id, saved_at: new Date().toISOString() }, { onConflict: 'user_id,cluster_id' });

      return NextResponse.json({ ok: true, correlation_id: correlationId });
    }

    if (action === 'unsave') {
      await supabaseAdmin
        .from('saved_opportunities')
        .delete()
        .eq('user_id', authContext.user.id)
        .eq('cluster_id', cluster_id);

      return NextResponse.json({ ok: true, correlation_id: correlationId });
    }

    if (action === 'dismiss') {
      // Mark the cluster as dismissed for this workspace
      const workspaceId = getWorkspaceId(authContext);
      await supabaseAdmin
        .from('trend_clusters')
        .update({ status: 'dismissed' })
        .eq('id', cluster_id)
        .eq('workspace_id', workspaceId);

      return NextResponse.json({ ok: true, correlation_id: correlationId });
    }

    return createApiErrorResponse('BAD_REQUEST', 'action must be save, unsave, or dismiss', 400, correlationId);
  } catch (err) {
    console.error(`[${correlationId}] opportunity action error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Action failed', 500, correlationId);
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function buildWhyNow(cluster: Record<string, unknown>): string {
  const rec = cluster.recommendation as string;
  const earlyness = (cluster.earlyness_score as number) || 0;
  const saturation = (cluster.saturation_score as number) || 0;
  const velocity24h = (cluster.signals_24h as number) || 0;
  const communityWins = (cluster.community_wins as number) || 0;
  const creatorCount = (cluster.creator_count as number) || 0;

  const parts: string[] = [];

  if (rec === 'ACT_NOW') {
    if (earlyness >= 70) parts.push('Very early — most creators haven\'t posted yet');
    else parts.push('Low competition window still open');

    if (velocity24h >= 3) parts.push(`${velocity24h} new signals in 24h — moving fast`);
    if (communityWins >= 2) parts.push(`${communityWins} creators already winning with this`);
  } else if (rec === 'TEST_SOON') {
    if (saturation <= 30) parts.push('Still room to stand out');
    else parts.push('Getting competitive — test quickly');

    if (creatorCount >= 3) parts.push(`${creatorCount} creators are watching this`);
  } else {
    if (velocity24h > 0) parts.push('Some early signals emerging');
    else parts.push('On the radar but not yet urgent');
  }

  // Use forecast breakdown reason if available
  const forecast = cluster.forecast_breakdown as Record<string, unknown> | null;
  if (forecast?.recommendation_reason) {
    parts.unshift(forecast.recommendation_reason as string);
  }

  return parts.slice(0, 2).join('. ') + '.';
}

function buildSuggestedAngle(cluster: Record<string, unknown>): string {
  const saturation = (cluster.saturation_score as number) || 0;
  const communityBestHook = cluster.community_best_hook as string | null;
  const communityWins = (cluster.community_wins as number) || 0;

  // If there's a proven hook, suggest building on it
  if (communityBestHook && communityWins >= 1) {
    return `Proven hook exists — try a fresh take on "${communityBestHook.slice(0, 60)}${communityBestHook.length > 60 ? '...' : ''}"`;
  }

  // Low saturation = original angle works
  if (saturation <= 20) {
    return 'Wide open — try a honest review or first-impression angle';
  }

  // Moderate saturation = differentiate
  if (saturation <= 40) {
    return 'Some competition — try a unique demo, comparison, or skeptic angle';
  }

  // High saturation = contrarian needed
  return 'Crowded space — go contrarian, show a flaw, or find an underserved audience';
}
