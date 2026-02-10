import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * GET /api/analytics — Unified analytics endpoint
 * Query params:
 *   type: throughput | velocity | top-content | revenue | hooks | va-performance | accounts
 *   days: number (default 30)
 */
export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'throughput';
    const days = parseInt(searchParams.get('days') || '30', 10);

    const db = supabaseAdmin;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    switch (type) {
      case 'throughput': {
        // Videos per status per day
        const { data: videos, error } = await db
          .from('videos')
          .select('status, recording_status, created_at, last_status_changed_at')
          .gte('created_at', since);

        if (error) throw error;

        // Group by day and status
        const byDay: Record<string, Record<string, number>> = {};
        for (const v of videos || []) {
          const day = (v.created_at || '').slice(0, 10);
          if (!day) continue;
          if (!byDay[day]) byDay[day] = {};
          const status = v.recording_status || v.status || 'unknown';
          byDay[day][status] = (byDay[day][status] || 0) + 1;
        }

        // Convert to array sorted by date
        const throughput = Object.entries(byDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, statuses]) => ({ date, ...statuses }));

        return NextResponse.json({ ok: true, data: { throughput, days, total: videos?.length || 0 }, correlation_id: correlationId });
      }

      case 'velocity': {
        // Average time per pipeline stage
        const { data: videos, error } = await db
          .from('videos')
          .select('status, recording_status, created_at, last_status_changed_at')
          .not('last_status_changed_at', 'is', null)
          .gte('created_at', since);

        if (error) throw error;

        const stages: Record<string, { total_hours: number; count: number }> = {};
        for (const v of videos || []) {
          const status = v.recording_status || v.status || 'unknown';
          const created = new Date(v.created_at).getTime();
          const changed = new Date(v.last_status_changed_at).getTime();
          const hours = (changed - created) / (1000 * 60 * 60);
          if (hours < 0 || hours > 720) continue; // Skip invalid

          if (!stages[status]) stages[status] = { total_hours: 0, count: 0 };
          stages[status].total_hours += hours;
          stages[status].count += 1;
        }

        const velocity = Object.entries(stages).map(([stage, data]) => ({
          stage,
          avg_hours: Math.round((data.total_hours / data.count) * 10) / 10,
          count: data.count,
        })).sort((a, b) => a.avg_hours - b.avg_hours);

        return NextResponse.json({ ok: true, data: { velocity, days }, correlation_id: correlationId });
      }

      case 'top-content': {
        // Top performing videos by views/engagement
        const { data: videos, error } = await db
          .from('videos')
          .select('id, title, status, views_total, likes_total, comments_total, shares_total, tiktok_url, product_id, product:product_id(id,name,brand)')
          .not('views_total', 'is', null)
          .gt('views_total', 0)
          .order('views_total', { ascending: false })
          .limit(20);

        if (error) throw error;

        const topContent = (videos || []).map(v => {
          const views = v.views_total || 0;
          const likes = v.likes_total || 0;
          const comments = v.comments_total || 0;
          const engagement = views > 0 ? ((likes + comments) / views * 100) : 0;
          const product = v.product as any;
          return {
            id: v.id,
            title: v.title,
            views: views,
            likes: likes,
            comments: comments,
            shares: v.shares_total || 0,
            engagement_rate: Math.round(engagement * 100) / 100,
            tiktok_url: v.tiktok_url,
            product_name: product?.name || null,
            product_brand: product?.brand || null,
          };
        });

        return NextResponse.json({ ok: true, data: { top_content: topContent }, correlation_id: correlationId });
      }

      case 'revenue': {
        // Revenue by brand
        const { data: videos, error } = await db
          .from('videos')
          .select('revenue_total, product:product_id(id,name,brand)')
          .not('revenue_total', 'is', null)
          .gt('revenue_total', 0);

        if (error) throw error;

        const byBrand: Record<string, { revenue: number; videos: number }> = {};
        for (const v of videos || []) {
          const product = v.product as any;
          const brand = product?.brand || 'Unbranded';
          if (!byBrand[brand]) byBrand[brand] = { revenue: 0, videos: 0 };
          byBrand[brand].revenue += v.revenue_total || 0;
          byBrand[brand].videos += 1;
        }

        const revenue = Object.entries(byBrand)
          .map(([brand, data]) => ({ brand, ...data }))
          .sort((a, b) => b.revenue - a.revenue);

        return NextResponse.json({ ok: true, data: { revenue, days }, correlation_id: correlationId });
      }

      case 'hooks': {
        // Hook type performance
        const { data: winners, error } = await db
          .from('winners_bank')
          .select('hook_type, content_format, view_count, engagement_rate');

        if (error) throw error;

        const byHookType: Record<string, { count: number; total_views: number; total_engagement: number }> = {};
        for (const w of winners || []) {
          const ht = w.hook_type || 'unknown';
          if (!byHookType[ht]) byHookType[ht] = { count: 0, total_views: 0, total_engagement: 0 };
          byHookType[ht].count += 1;
          byHookType[ht].total_views += w.view_count || 0;
          byHookType[ht].total_engagement += w.engagement_rate || 0;
        }

        const hooks = Object.entries(byHookType)
          .map(([type, data]) => ({
            hook_type: type,
            count: data.count,
            avg_views: data.count > 0 ? Math.round(data.total_views / data.count) : 0,
            avg_engagement: data.count > 0 ? Math.round(data.total_engagement / data.count * 100) / 100 : 0,
          }))
          .sort((a, b) => b.avg_views - a.avg_views);

        return NextResponse.json({ ok: true, data: { hooks }, correlation_id: correlationId });
      }

      case 'va-performance': {
        // VA edit speed and volume
        const { data: videos, error } = await db
          .from('videos')
          .select('assigned_to, recording_status, last_status_changed_at, created_at')
          .not('assigned_to', 'is', null)
          .gte('created_at', since);

        if (error) throw error;

        const byVA: Record<string, { assigned: number; completed: number; total_hours: number }> = {};
        for (const v of videos || []) {
          const va = v.assigned_to || 'unknown';
          if (!byVA[va]) byVA[va] = { assigned: 0, completed: 0, total_hours: 0 };
          byVA[va].assigned += 1;
          if (['POSTED', 'READY_TO_POST', 'EDITED'].includes(v.recording_status || '')) {
            byVA[va].completed += 1;
          }
        }

        const vaPerformance = Object.entries(byVA)
          .map(([va_id, data]) => ({
            va_id,
            assigned: data.assigned,
            completed: data.completed,
            completion_rate: data.assigned > 0 ? Math.round(data.completed / data.assigned * 100) : 0,
          }))
          .sort((a, b) => b.completed - a.completed);

        return NextResponse.json({ ok: true, data: { va_performance: vaPerformance, days }, correlation_id: correlationId });
      }

      case 'accounts': {
        // Per-account metrics
        const { data: videos, error } = await db
          .from('videos')
          .select('account_id, views_total, likes_total, comments_total, revenue_total, recording_status')
          .not('account_id', 'is', null);

        if (error) throw error;

        const byAccount: Record<string, { videos: number; posted: number; views: number; likes: number; revenue: number }> = {};
        for (const v of videos || []) {
          const acct = v.account_id || 'unknown';
          if (!byAccount[acct]) byAccount[acct] = { videos: 0, posted: 0, views: 0, likes: 0, revenue: 0 };
          byAccount[acct].videos += 1;
          if (v.recording_status === 'POSTED') byAccount[acct].posted += 1;
          byAccount[acct].views += v.views_total || 0;
          byAccount[acct].likes += v.likes_total || 0;
          byAccount[acct].revenue += v.revenue_total || 0;
        }

        // Fetch account names
        const { data: accounts } = await db.from('posting_accounts').select('id, display_name, account_code');
        const accountMap: Record<string, { name: string; handle: string }> = {};
        for (const a of accounts || []) {
          accountMap[a.id] = { name: a.display_name, handle: a.account_code || '' };
        }

        const accountMetrics = Object.entries(byAccount)
          .map(([id, data]) => ({
            account_id: id,
            name: accountMap[id]?.name || id.slice(0, 8),
            handle: accountMap[id]?.handle || '',
            ...data,
            avg_engagement: data.views > 0 ? Math.round(data.likes / data.views * 10000) / 100 : 0,
          }))
          .sort((a, b) => b.views - a.views);

        return NextResponse.json({ ok: true, data: { accounts: accountMetrics }, correlation_id: correlationId });
      }

      default:
        return createApiErrorResponse('BAD_REQUEST', `Unknown analytics type: ${type}`, 400, correlationId);
    }
  } catch (error) {
    console.error('[analytics] Error:', error);
    return createApiErrorResponse('INTERNAL', 'Analytics query failed', 500, correlationId);
  }
}
