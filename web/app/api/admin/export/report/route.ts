/**
 * Performance Report (Print-Ready HTML)
 * GET /api/admin/export/report?days=30
 * Returns a styled HTML page designed for print-to-PDF.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30');

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString();
  const endDateStr = new Date().toISOString();

  try {
    // Fetch videos
    const { data: videos } = await supabaseAdmin
      .from('videos')
      .select(`
        id, video_code, status, recording_status, created_at, posted_at,
        views, clicks, orders, revenue, virality_score,
        products:product_id(name, brand)
      `)
      .gte('created_at', startDateStr)
      .order('created_at', { ascending: false })
      .limit(5000);

    const allVideos = (videos || []) as Record<string, unknown>[];

    // Summary stats
    const totalVideos = allVideos.length;
    const postedVideos = allVideos.filter(v => v.posted_at);
    const totalViews = allVideos.reduce((s, v) => s + Number(v.views || 0), 0);
    const totalClicks = allVideos.reduce((s, v) => s + Number(v.clicks || 0), 0);
    const totalOrders = allVideos.reduce((s, v) => s + Number(v.orders || 0), 0);
    const totalRevenue = allVideos.reduce((s, v) => s + Number(v.revenue || 0), 0);

    // Top videos by views
    const topVideos = [...allVideos]
      .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
      .slice(0, 10);

    // Brand performance
    const brandMap: Record<string, { videos: number; views: number; revenue: number }> = {};
    for (const v of allVideos) {
      const product = v.products as { name: string; brand: string } | null;
      const brand = product?.brand || 'Unknown';
      if (!brandMap[brand]) brandMap[brand] = { videos: 0, views: 0, revenue: 0 };
      brandMap[brand].videos += 1;
      brandMap[brand].views += Number(v.views || 0);
      brandMap[brand].revenue += Number(v.revenue || 0);
    }
    const brandStats = Object.entries(brandMap)
      .sort(([, a], [, b]) => b.views - a.views)
      .slice(0, 10);

    // Status breakdown
    const statusCounts: Record<string, number> = {};
    for (const v of allVideos) {
      const status = String(v.recording_status || v.status || 'Unknown');
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    // Build HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>FlashFlow Performance Report — ${days} Days</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; background: white; padding: 40px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 14px; margin-bottom: 32px; }
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
  .stat-card { border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px; text-align: center; }
  .stat-value { font-size: 28px; font-weight: 700; color: #0f766e; }
  .stat-label { font-size: 12px; color: #666; margin-top: 4px; }
  h2 { font-size: 18px; font-weight: 600; margin: 24px 0 12px; border-bottom: 2px solid #0f766e; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
  th { text-align: left; background: #f8f8fa; padding: 8px 10px; font-weight: 600; border-bottom: 2px solid #e0e0e0; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #fafafa; }
  .bar-container { display: flex; align-items: center; gap: 8px; }
  .bar { height: 12px; background: #0f766e; border-radius: 6px; min-width: 4px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #999; text-align: center; }
  @media print {
    body { padding: 20px; }
    .no-print { display: none; }
    .stats-grid { break-inside: avoid; }
    table { break-inside: auto; }
    tr { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="no-print" style="margin-bottom:20px;padding:12px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:13px;color:#166534;">
  Press <strong>Ctrl+P</strong> (or Cmd+P) to save as PDF. This page is print-optimized.
</div>

<h1>FlashFlow Performance Report</h1>
<div class="subtitle">${startDateStr.split('T')[0]} — ${endDateStr.split('T')[0]} (${days} days)</div>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-value">${totalVideos}</div>
    <div class="stat-label">Videos Created</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${postedVideos.length}</div>
    <div class="stat-label">Videos Posted</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${totalViews >= 1000 ? (totalViews / 1000).toFixed(1) + 'K' : totalViews}</div>
    <div class="stat-label">Total Views</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">$${totalRevenue.toFixed(0)}</div>
    <div class="stat-label">Revenue</div>
  </div>
</div>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-value">${totalClicks}</div>
    <div class="stat-label">Clicks</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${totalOrders}</div>
    <div class="stat-label">Orders</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0'}%</div>
    <div class="stat-label">Click Rate</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${postedVideos.length > 0 ? (totalViews / postedVideos.length).toFixed(0) : '0'}</div>
    <div class="stat-label">Avg Views/Video</div>
  </div>
</div>

<h2>Pipeline Status Breakdown</h2>
<table>
  <thead><tr><th>Status</th><th>Count</th><th>Distribution</th></tr></thead>
  <tbody>
    ${Object.entries(statusCounts).sort(([,a],[,b]) => b - a).map(([status, count]) => {
      const pct = totalVideos > 0 ? (count / totalVideos) * 100 : 0;
      return `<tr><td>${status.replace(/_/g, ' ')}</td><td>${count}</td><td><div class="bar-container"><div class="bar" style="width:${Math.max(pct, 2)}%"></div><span>${pct.toFixed(0)}%</span></div></td></tr>`;
    }).join('')}
  </tbody>
</table>

<h2>Top 10 Videos by Views</h2>
<table>
  <thead><tr><th>Video</th><th>Brand</th><th>Views</th><th>Clicks</th><th>Orders</th><th>Revenue</th></tr></thead>
  <tbody>
    ${topVideos.map(v => {
      const product = v.products as { name: string; brand: string } | null;
      return `<tr>
        <td>${String(v.video_code || (v.id as string).slice(0, 8))}</td>
        <td>${product?.brand || '—'}</td>
        <td>${Number(v.views || 0).toLocaleString()}</td>
        <td>${Number(v.clicks || 0)}</td>
        <td>${Number(v.orders || 0)}</td>
        <td>$${Number(v.revenue || 0).toFixed(2)}</td>
      </tr>`;
    }).join('')}
  </tbody>
</table>

<h2>Brand Performance</h2>
<table>
  <thead><tr><th>Brand</th><th>Videos</th><th>Views</th><th>Revenue</th></tr></thead>
  <tbody>
    ${brandStats.map(([brand, d]) =>
      `<tr><td>${brand}</td><td>${d.videos}</td><td>${d.views.toLocaleString()}</td><td>$${d.revenue.toFixed(2)}</td></tr>`
    ).join('')}
  </tbody>
</table>

<div class="footer">
  Generated by FlashFlow AI · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
</div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    console.error('Report generation error:', error);
    return new NextResponse('Failed to generate report', { status: 500 });
  }
}
