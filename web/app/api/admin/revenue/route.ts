import { NextResponse } from 'next/server';
import { validateApiAccess } from '@/lib/auth/validateApiAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
  const auth = await validateApiAccess(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId } = auth;

  try {
    // Total GMV & Commission
    const { data: totals } = await supabaseAdmin
      .from('shop_orders')
      .select('order_amount, commission_amount, quantity')
      .eq('user_id', userId);

    const totalGmv = (totals || []).reduce((sum, o) => sum + parseFloat(o.order_amount || '0'), 0);
    const totalCommission = (totals || []).reduce((sum, o) => sum + parseFloat(o.commission_amount || '0'), 0);
    const totalOrders = (totals || []).length;
    const avgOrderValue = totalOrders > 0 ? totalGmv / totalOrders : 0;

    // Orders this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data: monthOrders } = await supabaseAdmin
      .from('shop_orders')
      .select('order_amount, commission_amount')
      .eq('user_id', userId)
      .gte('order_created_at', monthStart.toISOString());

    const monthOrderCount = (monthOrders || []).length;
    const monthGmv = (monthOrders || []).reduce((sum, o) => sum + parseFloat(o.order_amount || '0'), 0);
    const monthCommission = (monthOrders || []).reduce((sum, o) => sum + parseFloat(o.commission_amount || '0'), 0);

    // Revenue by brand (top 10)
    const { data: brandOrders } = await supabaseAdmin
      .from('shop_orders')
      .select('attributed_brand_id, order_amount, commission_amount')
      .eq('user_id', userId)
      .not('attributed_brand_id', 'is', null);

    const brandMap = new Map<string, { gmv: number; commission: number; orders: number }>();
    for (const o of brandOrders || []) {
      const key = o.attributed_brand_id;
      const entry = brandMap.get(key) || { gmv: 0, commission: 0, orders: 0 };
      entry.gmv += parseFloat(o.order_amount || '0');
      entry.commission += parseFloat(o.commission_amount || '0');
      entry.orders += 1;
      brandMap.set(key, entry);
    }

    // Fetch brand names
    const brandIds = Array.from(brandMap.keys());
    let brandNames: Record<string, string> = {};
    if (brandIds.length > 0) {
      const { data: brands } = await supabaseAdmin
        .from('brands')
        .select('id, name')
        .in('id', brandIds);
      brandNames = Object.fromEntries((brands || []).map(b => [b.id, b.name]));
    }

    const revenueByBrand = Array.from(brandMap.entries())
      .map(([id, data]) => ({ id, name: brandNames[id] || 'Unknown', ...data }))
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 10);

    // Revenue by product (top 10)
    const { data: productOrders } = await supabaseAdmin
      .from('shop_orders')
      .select('product_name, order_amount, commission_amount')
      .eq('user_id', userId);

    const productMap = new Map<string, { gmv: number; commission: number; orders: number }>();
    for (const o of productOrders || []) {
      const key = o.product_name || 'Unknown Product';
      const entry = productMap.get(key) || { gmv: 0, commission: 0, orders: 0 };
      entry.gmv += parseFloat(o.order_amount || '0');
      entry.commission += parseFloat(o.commission_amount || '0');
      entry.orders += 1;
      productMap.set(key, entry);
    }

    const revenueByProduct = Array.from(productMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 10);

    // Revenue timeline (last 12 weeks, grouped by week)
    const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 86400000);
    const { data: timelineOrders } = await supabaseAdmin
      .from('shop_orders')
      .select('order_amount, commission_amount, order_created_at')
      .eq('user_id', userId)
      .gte('order_created_at', twelveWeeksAgo.toISOString())
      .order('order_created_at', { ascending: true });

    const weekMap = new Map<string, { gmv: number; commission: number; orders: number }>();
    for (const o of timelineOrders || []) {
      const d = new Date(o.order_created_at);
      // Get Monday of the week
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      const weekKey = monday.toISOString().split('T')[0];

      const entry = weekMap.get(weekKey) || { gmv: 0, commission: 0, orders: 0 };
      entry.gmv += parseFloat(o.order_amount || '0');
      entry.commission += parseFloat(o.commission_amount || '0');
      entry.orders += 1;
      weekMap.set(weekKey, entry);
    }

    const timeline = Array.from(weekMap.entries())
      .map(([week, data]) => ({ week, ...data }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // Recent orders (last 20)
    const { data: recentOrders } = await supabaseAdmin
      .from('shop_orders')
      .select('id, tiktok_order_id, product_name, order_amount, commission_amount, order_status, order_created_at, attributed_brand_id, attributed_product_id, attribution_confidence')
      .eq('user_id', userId)
      .order('order_created_at', { ascending: false })
      .limit(20);

    // Enrich with brand names
    const recentBrandIds = [...new Set((recentOrders || []).map(o => o.attributed_brand_id).filter(Boolean))];
    let recentBrandNames: Record<string, string> = {};
    if (recentBrandIds.length > 0) {
      const { data: brands } = await supabaseAdmin
        .from('brands')
        .select('id, name')
        .in('id', recentBrandIds);
      recentBrandNames = Object.fromEntries((brands || []).map(b => [b.id, b.name]));
    }

    const recent = (recentOrders || []).map(o => ({
      ...o,
      brand_name: o.attributed_brand_id ? recentBrandNames[o.attributed_brand_id] || null : null,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        summary: {
          total_gmv: Math.round(totalGmv * 100) / 100,
          total_commission: Math.round(totalCommission * 100) / 100,
          total_orders: totalOrders,
          avg_order_value: Math.round(avgOrderValue * 100) / 100,
          month_orders: monthOrderCount,
          month_gmv: Math.round(monthGmv * 100) / 100,
          month_commission: Math.round(monthCommission * 100) / 100,
        },
        revenue_by_brand: revenueByBrand,
        revenue_by_product: revenueByProduct,
        timeline,
        recent_orders: recent,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Revenue API]', msg);
    return NextResponse.json({ ok: true, data: null, error: msg });
  }
}
