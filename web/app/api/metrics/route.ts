import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVideoMetricsColumns, getVideosPerformanceColumns } from '@/lib/performance-schema';

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const account_id = searchParams.get('account_id');
    const video_id = searchParams.get('video_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Require at least one filter
    if (!account_id && !video_id) {
      return NextResponse.json(
        { ok: false, error: 'Either account_id or video_id is required' },
        { status: 400 }
      );
    }

    // Validate date formats if provided
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return NextResponse.json(
        { ok: false, error: 'from date must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json(
        { ok: false, error: 'to date must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    // Check if video_metrics table exists
    const metricsColumns = await getVideoMetricsColumns();
    if (metricsColumns.size === 0) {
      return NextResponse.json(
        { ok: false, error: 'video_metrics table not found - run migration first' },
        { status: 500 }
      );
    }

    // Build query
    let query = supabaseAdmin.from('video_metrics').select('*');

    if (account_id) {
      query = query.eq('account_id', account_id);
    }
    if (video_id) {
      query = query.eq('video_id', video_id);
    }
    if (from) {
      query = query.gte('metric_date', from);
    }
    if (to) {
      query = query.lte('metric_date', to);
    }

    query = query.order('metric_date', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch video metrics:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch metrics' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: data || [] });

  } catch (error) {
    console.error('GET /api/metrics error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      video_id,
      account_id,
      metric_date,
      views = 0,
      likes = 0,
      comments = 0,
      shares = 0,
      saves = 0,
      clicks = 0,
      orders = 0,
      revenue = 0
    } = body;

    // Validate required fields
    if (!video_id || typeof video_id !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'video_id is required and must be a string' },
        { status: 400 }
      );
    }

    if (!metric_date || !/^\d{4}-\d{2}-\d{2}$/.test(metric_date)) {
      return NextResponse.json(
        { ok: false, error: 'metric_date is required and must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    // Validate numeric fields
    const numericFields = { views, likes, comments, shares, saves, clicks, orders };
    for (const [field, value] of Object.entries(numericFields)) {
      if (typeof value !== 'number' || value < 0) {
        return NextResponse.json(
          { ok: false, error: `${field} must be a non-negative number` },
          { status: 400 }
        );
      }
    }

    if (typeof revenue !== 'number' || revenue < 0) {
      return NextResponse.json(
        { ok: false, error: 'revenue must be a non-negative number' },
        { status: 400 }
      );
    }

    // Check schema
    const metricsColumns = await getVideoMetricsColumns();
    if (metricsColumns.size === 0) {
      return NextResponse.json(
        { ok: false, error: 'video_metrics table not found - run migration first' },
        { status: 500 }
      );
    }

    // Build upsert payload - only include columns that exist
    const upsertPayload: Record<string, unknown> = {
      video_id: video_id.trim(),
      metric_date,
      views,
      likes,
      comments,
      shares,
      saves,
      clicks,
      orders,
      revenue,
      updated_at: new Date().toISOString()
    };

    if (account_id && metricsColumns.has('account_id')) {
      upsertPayload.account_id = account_id.trim();
    }

    // Upsert metrics record
    const { data: metricsData, error: metricsError } = await supabaseAdmin
      .from('video_metrics')
      .upsert(upsertPayload, { 
        onConflict: 'video_id,metric_date',
        ignoreDuplicates: false 
      })
      .select();

    if (metricsError) {
      console.error('Failed to upsert video metrics:', metricsError);
      return NextResponse.json(
        { ok: false, error: 'Failed to save metrics' },
        { status: 500 }
      );
    }

    // Update video totals if columns exist
    const videosColumns = await getVideosPerformanceColumns();
    const videoUpdates: Record<string, unknown> = {};

    if (videosColumns.has('last_metric_at')) {
      videoUpdates.last_metric_at = new Date().toISOString();
    }

    // Calculate totals from all metrics for this video
    const { data: allMetrics, error: totalError } = await supabaseAdmin
      .from('video_metrics')
      .select('views, likes, comments, shares, orders, revenue')
      .eq('video_id', video_id);

    if (!totalError && allMetrics && allMetrics.length > 0) {
      const totals = allMetrics.reduce((acc, metric) => ({
        views: acc.views + (metric.views || 0),
        likes: acc.likes + (metric.likes || 0),
        comments: acc.comments + (metric.comments || 0),
        shares: acc.shares + (metric.shares || 0),
        orders: acc.orders + (metric.orders || 0),
        revenue: acc.revenue + (metric.revenue || 0)
      }), { views: 0, likes: 0, comments: 0, shares: 0, orders: 0, revenue: 0 });

      if (videosColumns.has('views_total')) videoUpdates.views_total = totals.views;
      if (videosColumns.has('likes_total')) videoUpdates.likes_total = totals.likes;
      if (videosColumns.has('comments_total')) videoUpdates.comments_total = totals.comments;
      if (videosColumns.has('shares_total')) videoUpdates.shares_total = totals.shares;
      if (videosColumns.has('orders_total')) videoUpdates.orders_total = totals.orders;
      if (videosColumns.has('revenue_total')) videoUpdates.revenue_total = totals.revenue;
    }

    // Update video record if we have updates
    if (Object.keys(videoUpdates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('videos')
        .update(videoUpdates)
        .eq('id', video_id);

      if (updateError) {
        console.error('Failed to update video totals:', updateError);
        // Don't fail the request, just log the error
      }
    }

    return NextResponse.json({ 
      ok: true, 
      data: metricsData?.[0] || null,
      totals_updated: Object.keys(videoUpdates).length > 0
    });

  } catch (error) {
    console.error('POST /api/metrics error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
