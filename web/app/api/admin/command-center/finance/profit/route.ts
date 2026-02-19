/**
 * GET /api/admin/command-center/finance/profit
 *
 * Owner-only. Returns profitability summary:
 *   - Total revenue, expenses (finance_transactions + API usage costs), profit
 *   - Daily series for charting
 *   - Top revenue/expense categories
 *
 * Query params:
 *   ?initiative_id=<uuid>  — filter by initiative
 *   ?project_id=<uuid>     — filter by project
 *   ?from=YYYY-MM-DD       — start date (default: 30 days ago)
 *   ?to=YYYY-MM-DD         — end date (default: today)
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { checkRateLimit } from '@/lib/command-center/rate-limiter';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  // Rate limit: 30 req/min per IP
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rl = checkRateLimit('profit', ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const initiativeFilter = searchParams.get('initiative_id');
  const projectFilter = searchParams.get('project_id');
  const from = searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = searchParams.get('to') || new Date().toISOString().slice(0, 10);

  try {
    // ── 1. Resolve project_ids for initiative filtering ──────────
    let projectIds: string[] | null = null;
    if (initiativeFilter) {
      const { data: initProjects } = await supabaseAdmin
        .from('cc_projects')
        .select('id')
        .eq('initiative_id', initiativeFilter);
      projectIds = (initProjects || []).map((p) => p.id);
    }

    // ── 2. Fetch finance transactions ────────────────────────────
    let txQuery = supabaseAdmin
      .from('finance_transactions')
      .select('direction, amount, category, project_id, ts')
      .gte('ts', `${from}T00:00:00Z`)
      .lte('ts', `${to}T23:59:59Z`);

    if (initiativeFilter) {
      txQuery = txQuery.eq('initiative_id', initiativeFilter);
    }
    if (projectFilter) {
      txQuery = txQuery.eq('project_id', projectFilter);
    }

    const { data: txns, error: txErr } = await txQuery;
    if (txErr) {
      console.error('[profit] tx query error:', txErr);
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    // ── 3. Fetch API usage costs (usage_daily_rollups) ───────────
    let usageQuery = supabaseAdmin
      .from('usage_daily_rollups')
      .select('day, cost_usd, project_id')
      .gte('day', from)
      .lte('day', to);

    if (projectFilter) {
      usageQuery = usageQuery.eq('project_id', projectFilter);
    } else if (projectIds && projectIds.length > 0) {
      // Filter usage by projects belonging to the initiative
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      usageQuery = (usageQuery as any).in('project_id', projectIds);
    }

    const { data: usageRows } = await usageQuery;

    // ── 4. Aggregate ─────────────────────────────────────────────
    // All amounts in cents (multiply dollar amounts by 100)
    let totalRevenueCents = 0;
    let totalExpenseCents = 0;

    // Daily buckets
    const dailyMap: Record<string, { revenue: number; expense: number }> = {};
    const initDay = (day: string) => {
      if (!dailyMap[day]) dailyMap[day] = { revenue: 0, expense: 0 };
    };

    // Category rollups
    const revenueByCat: Record<string, number> = {};
    const expenseByCat: Record<string, number> = {};

    // Process finance transactions
    for (const t of txns || []) {
      const amtCents = Math.round(Number(t.amount) * 100);
      const day = new Date(t.ts).toISOString().slice(0, 10);
      initDay(day);

      if (t.direction === 'in') {
        totalRevenueCents += amtCents;
        dailyMap[day].revenue += amtCents;
        revenueByCat[t.category] = (revenueByCat[t.category] || 0) + amtCents;
      } else {
        totalExpenseCents += amtCents;
        dailyMap[day].expense += amtCents;
        expenseByCat[t.category] = (expenseByCat[t.category] || 0) + amtCents;
      }
    }

    // Process API usage as expense (category: "api_usage")
    for (const u of usageRows || []) {
      const costCents = Math.round(Number(u.cost_usd) * 100);
      if (costCents <= 0) continue;
      totalExpenseCents += costCents;
      const day = u.day; // already YYYY-MM-DD
      initDay(day);
      dailyMap[day].expense += costCents;
      expenseByCat['api_usage'] = (expenseByCat['api_usage'] || 0) + costCents;
    }

    // ── 5. Build daily series (sorted) ───────────────────────────
    const dailySeries = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, vals]) => ({
        day,
        revenue_cents: vals.revenue,
        expense_cents: vals.expense,
        profit_cents: vals.revenue - vals.expense,
      }));

    // ── 6. Top categories (top 10 each) ──────────────────────────
    const topRevenue = Object.entries(revenueByCat)
      .map(([category, amount_cents]) => ({ category, amount_cents }))
      .sort((a, b) => b.amount_cents - a.amount_cents)
      .slice(0, 10);

    const topExpenses = Object.entries(expenseByCat)
      .map(([category, amount_cents]) => ({ category, amount_cents }))
      .sort((a, b) => b.amount_cents - a.amount_cents)
      .slice(0, 10);

    return NextResponse.json({
      ok: true,
      data: {
        from,
        to,
        total_revenue_cents: totalRevenueCents,
        total_expense_cents: totalExpenseCents,
        total_profit_cents: totalRevenueCents - totalExpenseCents,
        daily_series: dailySeries,
        top_revenue_categories: topRevenue,
        top_expense_categories: topExpenses,
      },
    });
  } catch (err) {
    console.error('[profit] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
