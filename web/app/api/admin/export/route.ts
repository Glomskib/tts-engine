/**
 * Unified Export API
 * GET /api/admin/export?type=csv_videos|csv_analytics&days=30
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

function escapeCSV(val: unknown): string {
  const str = String(val ?? '');
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCSV(headers: string[], rows: string[][]): string {
  return [
    headers.join(','),
    ...rows.map(row => row.map(escapeCSV).join(',')),
  ].join('\n');
}

export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const days = parseInt(searchParams.get('days') || '30');

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString();

  try {
    if (type === 'csv_videos') {
      return await exportVideos(authContext.user.id, startDateStr, days);
    }
    if (type === 'csv_analytics') {
      return await exportAnalytics(authContext.user.id, startDateStr, days);
    }
    return NextResponse.json({ ok: false, error: 'Invalid type. Use: csv_videos, csv_analytics' }, { status: 400 });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ ok: false, error: 'Export failed' }, { status: 500 });
  }
}

async function exportVideos(userId: string, startDate: string, days: number) {
  // Get user's account(s) to scope data
  const { data: videos } = await supabaseAdmin
    .from('videos')
    .select(`
      id,
      video_code,
      status,
      recording_status,
      created_at,
      posted_at,
      views,
      clicks,
      orders,
      revenue,
      virality_score,
      caption_used,
      tt_post_url,
      products:product_id(name, brand),
      accounts:account_id(name)
    `)
    .gte('created_at', startDate)
    .order('created_at', { ascending: false })
    .limit(5000);

  const headers = [
    'Video Code', 'Status', 'Recording Status', 'Product', 'Brand', 'Account',
    'Views', 'Clicks', 'Orders', 'Revenue', 'Virality Score',
    'Caption', 'TikTok URL', 'Created', 'Posted',
  ];

  const rows = (videos || []).map((v: Record<string, unknown>) => {
    const product = v.products as { name: string; brand: string } | null;
    const account = v.accounts as { name: string } | null;
    return [
      String(v.video_code || v.id || ''),
      String(v.status || ''),
      String(v.recording_status || ''),
      String(product?.name || ''),
      String(product?.brand || ''),
      String(account?.name || ''),
      String(v.views ?? ''),
      String(v.clicks ?? ''),
      String(v.orders ?? ''),
      String(v.revenue ?? ''),
      String(v.virality_score ?? ''),
      String(v.caption_used || ''),
      String(v.tt_post_url || ''),
      v.created_at ? new Date(v.created_at as string).toISOString().split('T')[0] : '',
      v.posted_at ? new Date(v.posted_at as string).toISOString().split('T')[0] : '',
    ];
  });

  const csv = toCSV(headers, rows);
  const filename = `flashflow-videos-${days}d-${new Date().toISOString().split('T')[0]}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

async function exportAnalytics(userId: string, startDate: string, days: number) {
  // Aggregate posted videos by day
  const { data: videos } = await supabaseAdmin
    .from('videos')
    .select('posted_at, views, clicks, orders, revenue')
    .not('posted_at', 'is', null)
    .gte('posted_at', startDate)
    .order('posted_at', { ascending: true })
    .limit(10000);

  // Group by date
  const byDate: Record<string, { posted: number; views: number; clicks: number; orders: number; revenue: number }> = {};
  for (const v of (videos || []) as Record<string, unknown>[]) {
    const date = (v.posted_at as string).split('T')[0];
    if (!byDate[date]) byDate[date] = { posted: 0, views: 0, clicks: 0, orders: 0, revenue: 0 };
    byDate[date].posted += 1;
    byDate[date].views += Number(v.views || 0);
    byDate[date].clicks += Number(v.clicks || 0);
    byDate[date].orders += Number(v.orders || 0);
    byDate[date].revenue += Number(v.revenue || 0);
  }

  const headers = ['Date', 'Videos Posted', 'Total Views', 'Total Clicks', 'Orders', 'Revenue'];
  const rows = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => [
      date,
      String(d.posted),
      String(d.views),
      String(d.clicks),
      String(d.orders),
      d.revenue.toFixed(2),
    ]);

  const csv = toCSV(headers, rows);
  const filename = `flashflow-analytics-${days}d-${new Date().toISOString().split('T')[0]}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
