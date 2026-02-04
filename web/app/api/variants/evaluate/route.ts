import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getVariantsWinnerColumns, getVideoMetricsColumns } from '@/lib/performance-schema';
import { VARIANT_STATUSES } from '@/lib/schema-migration';

export const runtime = "nodejs";

interface MetricsAccumulator {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  orders: number;
  revenue: number;
}

interface VideoMetric {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  orders?: number;
  revenue?: number;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { concept_id, account_id, days = 7 } = body;

    // Validate days parameter
    if (typeof days !== 'number' || days < 1 || days > 365) {
      return NextResponse.json(
        { ok: false, error: 'days must be a number between 1 and 365' },
        { status: 400 }
      );
    }

    // Check if required tables exist
    const metricsColumns = await getVideoMetricsColumns();
    const variantsColumns = await getVariantsWinnerColumns();
    
    if (metricsColumns.size === 0) {
      return NextResponse.json(
        { ok: false, error: 'video_metrics table not found - run migration first' },
        { status: 500 }
      );
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Build query to get variants with their associated videos and metrics
    let variantsQuery = supabaseAdmin
      .from('variants')
      .select(`
        id,
        concept_id,
        status,
        score,
        is_winner,
        winner_reason,
        videos!inner(
          id,
          account_id,
          status,
          video_metrics!inner(
            views,
            likes,
            comments,
            shares,
            orders,
            revenue,
            metric_date
          )
        )
      `);

    // Apply filters
    if (concept_id) {
      variantsQuery = variantsQuery.eq('concept_id', concept_id);
    }
    if (account_id) {
      variantsQuery = variantsQuery.eq('videos.account_id', account_id);
    }

    // Filter for posted videos with metrics in date range
    variantsQuery = variantsQuery
      .eq('videos.status', 'posted')
      .gte('videos.video_metrics.metric_date', startDateStr)
      .lte('videos.video_metrics.metric_date', endDateStr);

    const { data: variantsData, error: variantsError } = await variantsQuery;

    if (variantsError) {
      console.error('Failed to fetch variants with metrics:', variantsError);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch variant data' },
        { status: 500 }
      );
    }

    const evaluatedVariants: Array<{
      variant_id: string;
      video_id: string;
      score: number;
      reason: string;
    }> = [];

    const winners: Array<{
      variant_id: string;
      video_id: string;
      score: number;
      reason: string;
    }> = [];

    // Process each variant
    for (const variant of variantsData || []) {
      for (const video of variant.videos) {
        // Calculate total metrics for this video in the date range
        const totalMetrics = video.video_metrics.reduce((acc: MetricsAccumulator, metric: VideoMetric) => ({
          views: acc.views + (metric.views || 0),
          likes: acc.likes + (metric.likes || 0),
          comments: acc.comments + (metric.comments || 0),
          shares: acc.shares + (metric.shares || 0),
          orders: acc.orders + (metric.orders || 0),
          revenue: acc.revenue || 0 + (metric.revenue || 0)
        }), { views: 0, likes: 0, comments: 0, shares: 0, orders: 0, revenue: 0 });

        // Calculate score using the formula
        const score = (totalMetrics.views * 1) + 
                     (totalMetrics.likes * 5) + 
                     (totalMetrics.comments * 8) + 
                     (totalMetrics.shares * 10) + 
                     (totalMetrics.orders * 100) + 
                     (totalMetrics.revenue * 20);

        // Update variant score if column exists
        const variantUpdates: Record<string, unknown> = {};
        if (variantsColumns.has('score')) {
          variantUpdates.score = score;
        }

        // Determine if this is a winner
        let isWinner = false;
        let winnerReason = '';

        if (totalMetrics.orders >= 3) {
          isWinner = true;
          winnerReason = `${totalMetrics.orders} orders in ${days}d`;
        } else if (totalMetrics.revenue >= 50) {
          isWinner = true;
          winnerReason = `$${totalMetrics.revenue.toFixed(2)} revenue in ${days}d`;
        } else if (score >= 5000) {
          isWinner = true;
          winnerReason = `Score ${score.toFixed(0)} in ${days}d`;
        }

        if (isWinner) {
          if (variantsColumns.has('is_winner')) {
            variantUpdates.is_winner = true;
          }
          if (variantsColumns.has('winner_reason')) {
            variantUpdates.winner_reason = winnerReason;
          }
          if (variantsColumns.has('promoted_at')) {
            variantUpdates.promoted_at = new Date().toISOString();
          }
          
          // Set status to winner if status column exists and contains winner status
          if (variantsColumns.has('status') && VARIANT_STATUSES.includes('winner')) {
            variantUpdates.status = 'winner';
          }

          winners.push({
            variant_id: variant.id,
            video_id: video.id,
            score,
            reason: winnerReason
          });
        }

        // Update variant if we have changes
        if (Object.keys(variantUpdates).length > 0) {
          const { error: updateError } = await supabaseAdmin
            .from('variants')
            .update(variantUpdates)
            .eq('id', variant.id);

          if (updateError) {
            console.error(`Failed to update variant ${variant.id}:`, updateError);
            // Continue processing other variants
          }
        }

        evaluatedVariants.push({
          variant_id: variant.id,
          video_id: video.id,
          score,
          reason: isWinner ? winnerReason : `Score ${score.toFixed(0)} (below threshold)`
        });
      }
    }

    return NextResponse.json({
      ok: true,
      evaluated_count: evaluatedVariants.length,
      winners_count: winners.length,
      winners,
      date_range: { from: startDateStr, to: endDateStr },
      all_evaluated: evaluatedVariants
    });

  } catch (error) {
    console.error('POST /api/variants/evaluate error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
