/**
 * API: Brand Dashboard
 *
 * GET /api/brand/dashboard?brand_id=<uuid>
 *
 * Returns velocity metrics, active experiments, and recent winners
 * for the authenticated user's brand.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { getBrandRole } from '@/lib/brands/permissions';
import type { VelocityMetrics, Experiment, ExperimentCreative } from '@/lib/brands/types';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user, isAdmin } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const url = new URL(request.url);
  const brandId = url.searchParams.get('brand_id');
  if (!brandId) {
    return createApiErrorResponse('BAD_REQUEST', 'brand_id is required', 400, correlationId);
  }

  // Check permission: must be admin or have brand membership
  if (!isAdmin) {
    const role = await getBrandRole(user.id, brandId);
    if (!role) {
      return createApiErrorResponse('UNAUTHORIZED', 'No access to this brand', 403, correlationId);
    }
  }

  // Get brand info
  const { data: brand } = await supabaseAdmin
    .from('brands')
    .select('id, name')
    .eq('id', brandId)
    .single();

  if (!brand) {
    return createApiErrorResponse('NOT_FOUND', 'Brand not found', 404, correlationId);
  }

  // Velocity metrics: count content_items for this brand in current vs previous month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [thisMonthRes, lastMonthRes] = await Promise.all([
    supabaseAdmin
      .from('content_items')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .gte('created_at', startOfMonth),
    supabaseAdmin
      .from('content_items')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .gte('created_at', startOfLastMonth)
      .lt('created_at', startOfMonth),
  ]);

  const creativesThisMonth = thisMonthRes.count || 0;
  const creativesLastMonth = lastMonthRes.count || 0;
  const velocityChange = creativesLastMonth > 0
    ? Math.round(((creativesThisMonth - creativesLastMonth) / creativesLastMonth) * 100)
    : creativesThisMonth > 0 ? 100 : 0;

  // Active experiments
  const { data: experiments } = await supabaseAdmin
    .from('experiments')
    .select('*, brands:brand_id(name), products:product_id(name)')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(20);

  const mappedExperiments: Experiment[] = (experiments || []).map((e: Record<string, unknown>) => ({
    ...e,
    brand_name: (e.brands as { name: string } | null)?.name || null,
    product_name: (e.products as { name: string } | null)?.name || null,
  })) as Experiment[];

  const activeCount = mappedExperiments.filter(e => e.status === 'running').length;

  // Winners: experiment_creatives with is_winner = true
  const { data: winners } = await supabaseAdmin
    .from('experiment_creatives')
    .select('*, content_items:content_item_id(title, status)')
    .eq('is_winner', true)
    .in('experiment_id', mappedExperiments.map(e => e.id))
    .order('created_at', { ascending: false })
    .limit(10);

  const mappedWinners: ExperimentCreative[] = (winners || []).map((w: Record<string, unknown>) => ({
    ...w,
    content_item_title: (w.content_items as { title: string } | null)?.title || null,
    content_item_status: (w.content_items as { status: string } | null)?.status || null,
  })) as ExperimentCreative[];

  // Avg engagement from posted content for this brand
  const { data: posts } = await supabaseAdmin
    .from('content_item_posts')
    .select('id, content_item_id')
    .in('content_item_id',
      (await supabaseAdmin
        .from('content_items')
        .select('id')
        .eq('brand_id', brandId)
      ).data?.map((c: { id: string }) => c.id) || []
    )
    .limit(100);

  let avgEngagement = 0;
  if (posts?.length) {
    const { data: snapshots } = await supabaseAdmin
      .from('content_item_metrics_snapshots')
      .select('content_item_post_id, views, likes, comments, shares')
      .in('content_item_post_id', posts.map(p => p.id))
      .order('captured_at', { ascending: false });

    const latestByPost = new Map<string, { views: number; likes: number; comments: number; shares: number }>();
    for (const s of (snapshots || [])) {
      if (!latestByPost.has(s.content_item_post_id)) {
        latestByPost.set(s.content_item_post_id, s);
      }
    }

    const rates: number[] = [];
    for (const m of latestByPost.values()) {
      if (m.views > 0) {
        rates.push(((m.likes + m.comments + m.shares) / m.views) * 100);
      }
    }
    if (rates.length > 0) {
      avgEngagement = Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100;
    }
  }

  const velocity: VelocityMetrics = {
    creatives_this_month: creativesThisMonth,
    creatives_last_month: creativesLastMonth,
    velocity_change: velocityChange,
    active_experiments: activeCount,
    total_winners: mappedWinners.length,
    avg_engagement_rate: avgEngagement,
  };

  return NextResponse.json({
    ok: true,
    data: {
      brand: { id: brand.id, name: brand.name },
      velocity,
      experiments: mappedExperiments,
      recent_winners: mappedWinners,
    },
    correlation_id: correlationId,
  });
}, { routeName: '/api/brand/dashboard', feature: 'brand-dashboard' });
